/**
 * Code to switch environments, which means that all "live" pages, identified
 * by a specified prefix, are deleted, and all "temp" pages, starting with
 * another prefix, are moved (renamed) to the "live" prefix
 * 
 * This script cannot work on its own, there should be a tab with a content 
 * script running on a wiki page to perform the wiki api operations in the
 * proper context, which is set in the background script. 
 */
(async function() {
    // Get the id of the tab where the content script runs (as a global 
    // variable)
    let background_page = await browser.runtime.getBackgroundPage()
    var script_tab = background_page.script_tab_id

    let migrater = new Migrater()

    // When the search button is clicked, search for all live and temp pages 
    // using the prefixes specified by the user.
    document.getElementById("button_search").addEventListener("click", (event) => {
        document.getElementById("error").style.visibility = "hidden"
        document.getElementById("pages").innerHTML = ""
    
        migrater.collectPages(document.getElementById("prefix_live").value, document.getElementById("prefix_temp").value).then(() => {
            // Enable the migrate button if there are is at least one temp page
            for (i = 0; i < migrater.pairs.length; i++) { // we can't use break on forEach()
                if (migrater.pairs[i].temp_id !== null) {
                    document.getElementById("button_switch").removeAttribute("disabled")
                    break
                }
            }

            // Show all pages that will be migrated, published and deleted
            let div = document.getElementById("pages")
            let list = document.createElement("ul")
            migrater.pairs.forEach(pair => {
                let li = document.createElement("li")
                li.innerHTML = pair.render()
                list.appendChild(li)
            })
            div.appendChild(list)
            div.style.visibility = "initial"
        }).catch(error => {
            showError(error)
        })
        event.preventDefault()
    })

    // When the switch button is clicked, delete all live pages and rename all
    // temp pages using the live prefix.
    document.getElementById("button_switch").addEventListener("click", async function(event) {
        document.getElementById("error").style.visibility = "hidden"
        migrater.switchPages((index, is_successful, message) => {
            let li = document.getElementById("pages").getElementsByTagName("li")[index]
            li.innerHTML = message
            if (is_successful) { 
                li.style.color = "green"
            } else {
                li.style.color = "red"
            }
        })
    })
    
    /**
     * Display an error message, using the dedicated div.
     * @param msg the message to display
     */
    function showError(msg) {
        let error = document.getElementById("error")
        error.innerHTML = msg
        error.style.visibility = "initial"
    }
})()

/**
 * The main functionality for searching and switching pages.
 */
function Migrater(script_tab) {
    this.live_prefix = ""
    this.temp_prefix = ""

    this.pairs = []

    /** 
     * Collect all live and temp pages, and store them as Pairs in the "pairs" array.
     * @param live_prefix the prefix to search for when looking for live pages
     * @param temp_prefix the prefix to search for when looking for temp pages
     */
    this.collectPages = async function(live_prefix, temp_prefix) {
        this.live_prefix = live_prefix
        this.temp_prefix = temp_prefix

        // Search live and temp pages, respectively
        let live_pages = null
        let temp_pages = null
        let searches = []
        searches.push(this.collectPrefixedPages(live_prefix).then(pages => {
            if (pages === false) {
                return Promise.reject(Error("Er was een probleem met het zoeken naar live pagina's"))
            } else {
                live_pages = pages
            }
        }))
        searches.push(this.collectPrefixedPages(temp_prefix).then(pages => {
            if (pages === false) {
                return Promise.reject(Error("Er was een probleem met het zoeken naar live pagina's"))
            } else {
                temp_pages = pages
            }
        }))

        await Promise.all(searches)
        
        // Match all live pages to temp pages, or store them as unmatched Pair
        this.pairs = []
        while (Object.keys(live_pages).length) {
            let live_title  = Object.keys(live_pages)[0]
            let naked_title = live_title.replace(live_prefix, "")
            let temp_title  = temp_prefix + naked_title
            let temp_id     = null
            if (temp_title in temp_pages) {
                temp_id = temp_pages[temp_title]
                delete temp_pages[temp_title]
            }
            this.pairs.push(new Pair(live_pages[live_title], temp_id, naked_title, live_prefix, temp_prefix))
            delete live_pages[live_title]
        }
        // Add remaining temp pages as unbalanced Pair's
        for (const temp_title in temp_pages) {
            this.pairs.push(new Pair(null, temp_pages[temp_title], temp_title.replace(temp_prefix, ""), live_prefix, temp_prefix))
        }
    }

    /**
     * Helper method to collect all pages on the wiki starting with a given
     * prefix.
     * @param type either "temp" or "live" to indicate what type of pages we're
     *             searching for.
     * @param prefix search pages starting with this prefix. 
     * @returns an object with page ids as key and page title as value, or 
     *          false on error
     */
    this.collectPrefixedPages = async function(prefix) {
        let payload = {"list": "prefixsearch", "pslimit": 500, "pssearch": prefix}
        let success = true
        let result = await browser.tabs.sendMessage(script_tab, {"type": "wikiQuery", "payload": payload}).catch(() => {success = false})
        if (!success) {
            showError("Error searching for pages")
            return false
        }

        let pages = {}
        for (const page_num in result["prefixsearch"]) {
            let page = result["prefixsearch"][page_num]
            pages[page.title] = page.pageid
        }

        return pages
    }

    /**
     * Switch the temp pages to live pages (or publish temp pages and delete
     * live pages, when pairs aren't matched).
     * @param callback a callback function which takes the index, the status
     *                 and the message of the pair switch.
     */
    this.switchPages = async function(callback) {
        for (let i = 0; i < this.pairs.length; i++) {
            let pair = this.pairs[i]
            pair.switch(this.script_tab).then(() => {
                callback(i, true, pair.render())
            }).catch(err => {
                callback(i, false, pair.render())
            })
        }
    }
}

/**
 * A pair of a live page and a temp page which will replace it. Either may be
 * empty to indicate a new or deleted page after publishing.
 * @param live_id the page id of the live page. May be null when there is no live page.
 * @param temp_id the page id of the temp page. May be null when there is no temp page.
 * @param naked_title the title of the page without any prefixes.
 * @param live_prefix the prefix for live pages.
 * @param temp_prefix the prefix for temp pages.
 */
function Pair(live_id, temp_id, naked_title, live_prefix, temp_prefix) {
    this.live_id     = live_id
    this.temp_id     = temp_id
    this.naked_title = naked_title
    this.live_prefix = live_prefix
    this.temp_prefix = temp_prefix

    // Cache the status message when performing the switch 
    this.status_message = null

    /**
     * Make the switch: delete the live page and rename the temp page to the
     * live prefix.
     */
    this.switch = async function() {
        if (this.live_id !== null) {
            let deleted = await browser.tabs.sendMessage(script_tab, {"type": "wikiDeletePage", "page_id": this.live_id})
            if (deleted === false) {
                this.status_message = this.live_prefix + this.naked_title + " kan niet verwijderd worden."
                return Promise.reject(Error(this.status_message))
            }
            this.status_message = this.live_prefix + this.naked_title + " is verwijderd"
        }
        if (this.temp_id !== null) {
            let moved = await browser.tabs.sendMessage(script_tab, {"type": "wikiMovePage", "page_id": this.temp_id, "new_title": this.live_prefix + this.naked_title})
            if (moved === false) {
                this.status_message = this.temp_prefix + this.naked_title + " kan niet worden verplaatst."
                return Promise.reject(Error(this.status_message))
            }
            this.status_message = this.temp_prefix + this.naked_title + " is hernoemd naar " + moved["to"] 
        }
    }

    /**
     * Render a textual representation of the pair. If the switch is already
     * performed, this will be the status message, otherwise a message is
     * constructed.
     */
    this.render = function() {
        if (this.status_message !== null) {
            return this.status_message
        }
        if (this.live_id === null) {
            return this.temp_prefix + this.naked_title + " wordt nieuw gepubliceerd"
        } else if (this.temp_id === null) {
            return this.live_prefix + this.naked_title + " wordt verwijderd"
        } else {
            return this.live_prefix + this.naked_title + " wordt vervangen door " + this.temp_prefix + this.naked_title
        }
   }
}