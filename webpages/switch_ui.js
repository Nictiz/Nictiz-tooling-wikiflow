/**
 * Code to switch environments, which means that all "live" pages, identified
 * by a specified prefix, are deleted, and all "staging" pages, starting with
 * another prefix, are duplicated to the "live" prefix, rewriting links and
 * transclusions to this new prefix.
 * 
 * This script cannot work on its own, there should be a tab with a content 
 * script running on a wiki page to perform the wiki api operations in the
 * proper context, which is set in the background script. 
 */

(async function() {
    // Get the id of the tab where the content script runs (as a global 
    // variable)
    let background_page = await browser.runtime.getBackgroundPage()
    script_tab = background_page.script_tab_id

    let migrater = new Migrater()

    // When the search button is clicked, search for all live and staging pages 
    // using the prefixes specified by the user.
    document.getElementById("button_search").addEventListener("click", (event) => {
        // Reset everything
        document.getElementById("error").style.visibility = "hidden"
        let div = document.getElementById("pairs")
        div.innerHTML = "<table id='pairs_table'></table>"
        document.getElementById("button_switch").setAttribute("disabled", "disabled")
    
        migrater.collectPages(document.getElementById("prefix_live").value, document.getElementById("prefix_staging").value).then(() => {
            // Enable the migrate button if there are is at least one staging page
            for (i = 0; i < migrater.pairs.length; i++) { // we can't use break on forEach()
                if (migrater.pairs[i].staging_id !== null) {
                    document.getElementById("button_switch").removeAttribute("disabled")
                    break
                }
            }

            // Show all pages that will be migrated, published and deleted
            let table = document.getElementById("pairs_table")
            migrater.pairs.forEach(pair => {
                let tr = document.createElement("tr")
                tr.innerHTML = "<td><input type='checkbox' checked></td><td>" + pair.render().join("</td><td>") + "</td>"
                table.appendChild(tr)
            })
            div.style.visibility = "initial"
        }).catch(error => {
            showError(error)
        })
    })

    // When the switch button is clicked, delete all live pages and rename all
    // staging pages using the live prefix.
    document.getElementById("button_switch").addEventListener("click", async function(event) {
        document.getElementById("error").style.visibility = "hidden"
        
        // Construct a list of indexes which should be included/excluded
        let active_index = []
        let rows = document.getElementById("pairs_table").getElementsByTagName("tr")
        for (i = 0; i < rows.length; i++) {
            if (rows[i].querySelector("input[type='checkbox']:checked") === null) {
                active_index.push(false)
            } else {
                active_index.push(true)
            }
        }

        // Perform the migration
        migrater.switchPages(active_index, (index, is_successful, message) => {
            let tr = document.getElementById("pairs_table").getElementsByTagName("tr")[index]
            tr.innerHTML = "<td></td><td>" + message.join("</td><td>") + "</td>"
            tr.className = is_successful ? "success" : "failure"
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
function Migrater() {
    this.live_prefix    = ""
    this.staging_prefix = ""

    this.pairs = []

    /** 
     * Collect all live and staging pages, and store them as Pairs in the "pairs" array.
     * @param live_prefix the prefix to search for when looking for live pages
     * @param staging_prefix the prefix to search for when looking for staging pages
     */
    this.collectPages = async function(live_prefix, staging_prefix) {
        this.live_prefix    = live_prefix
        this.staging_prefix = staging_prefix

        // Search live and staging pages, respectively
        let live_pages    = null
        let staging_pages = null
        let searches = []
        searches.push(this.collectPrefixedPages(live_prefix)
            .then(pages => live_pages = pages)
            .catch(err => {return Promise.reject(err)}))
        searches.push(this.collectPrefixedPages(staging_prefix)
            .then(pages => staging_pages = pages)
            .catch(err => {return Promise.reject(err)}))

        await Promise.all(searches)
        
        // Match all live pages to staging pages, or store them as unmatched Pair
        this.pairs = []
        while (Object.keys(live_pages).length) {
            let live_title    = Object.keys(live_pages)[0]
            let naked_title   = live_title.replace(live_prefix, "")
            let staging_title = staging_prefix + naked_title
            let staging_id    = null
            if (staging_title in staging_pages) {
                staging_id = staging_pages[staging_title]
                delete staging_pages[staging_title]
            }
            this.pairs.push(new Pair(live_pages[live_title], staging_id, naked_title, live_prefix, staging_prefix))
            delete live_pages[live_title]
        }
        // Add remaining staging pages as unbalanced Pair's
        for (const staging_title in staging_pages) {
            this.pairs.push(new Pair(null, staging_pages[staging_title], staging_title.replace(staging_prefix, ""), live_prefix, staging_prefix))
        }
    }

    /**
     * Helper method to collect all pages on the wiki starting with a given
     * prefix.
     * @param prefix search pages starting with this prefix. 
     * @returns an object with page ids as key and page title as value
     */
    this.collectPrefixedPages = async function(prefix) {
        let payload = {"list": "prefixsearch", "pslimit": 500, "pssearch": prefix}
        let success = true
        let result = await browser.tabs.sendMessage(script_tab, {"type": "wikiQuery", "payload": payload}).catch(() => {success = false})
        if (!success) {
            return Promise.reject(Error("Error searching for pages"))
        }

        let pages = {}
        for (const page_num in result["prefixsearch"]) {
            let page = result["prefixsearch"][page_num]
            pages[page.title] = page.pageid
        }

        return pages
    }

    /**
     * Switch the staging pages to live pages (or publish staging pages and delete
     * live pages, when pairs aren't matched).
     * @param active_indexes an array with booleans to indicate for each index
     *                       whether the switch should be made.
     * @param callback a callback function which takes the index, the status
     *                 and the message of the pair switch.
     */
    this.switchPages = async function(active_indexes, callback) {
        for (let i = 0; i < this.pairs.length; i++) {
            if (active_indexes[i]) {
                let pair = this.pairs[i]
                pair.switch(this.script_tab).then(() => {
                    callback(i, true, pair.render())
                }).catch(err => {
                    callback(i, false, pair.render())
                })
            }
        }
    }
}

/**
 * A pair of a live page and a staging page which will replace it. Either may be
 * empty to indicate a new or deleted page after publishing.
 * @param live_id the page id of the live page. May be null when there is no live page.
 * @param staging_id the page id of the staging page. May be null when there is no staging page.
 * @param naked_title the title of the page without any prefixes.
 * @param live_prefix the prefix for live pages.
 * @param staging_prefix the prefix for staging pages.
 */
function Pair(live_id, staging_id, naked_title, live_prefix, staging_prefix) {
    this.live_id        = live_id
    this.staging_id     = staging_id
    this.naked_title    = naked_title
    this.live_prefix    = live_prefix
    this.staging_prefix = staging_prefix

    // Cache the status message when performing the switch 
    this.status_message = null

    /**
     * Make the switch: delete the live page, rewrite the staging page and rename
     * it to the live prefix.
     */
    this.switch = async function() {
        if (this.live_id !== null) {
            // Delete the live page
            let deleted = await browser.tabs.sendMessage(script_tab, {"type": "wikiDeletePage", "page_id": this.live_id}).catch(err => console.log(err))
            if (deleted === false) {
                this.status_message = ["", "kan niet verwijderd worden:", this.live_prefix + this.naked_title]
                return Promise.reject(Error(this.status_message.join(" ")))
            }
            this.status_message = ["", "is verwijderd:", this.live_prefix + this.naked_title]
        }
        if (this.staging_id !== null) {
            // Duplicate the staging page to the live page
            let duplication = await browser.tabs.sendMessage(script_tab, {"type": "wikiDuplicatePage", "title": this.staging_prefix + this.naked_title, "new_title": this.live_prefix + this.naked_title})
            if (duplication === false) {
                this.status_message = [this.staging_prefix + this.naked_title, ": pagina kan niet gedupliceerd worden", ""]
                return Promise.reject(Error(this.status_message.join(" ")))
            }

            // Get the id of the new live page
            let payload = {"titles": this.live_prefix + this.naked_title}
            let id_query = await browser.tabs.sendMessage(script_tab, {"type": "wikiQuery", "payload": payload})
            if (id_query === null || Object.keys(id_query["pages"]).length < 1) {
                this.status_message = ["", "Kan geen id ophalen voor pagina", this.live_prefix + this.naked_title]
                return Promise.reject(Error(this.status_message.join(" ")))
            }
            let new_live_id = Object.keys(id_query["pages"])[0]

            // Get the wikitext of the new live page
            let text_query = await browser.tabs.sendMessage(script_tab, {"type": "wikiGetText", "query_key": "pageid=" + new_live_id})
            if (text_query === null) {
                this.status_message = [this.temp_prefix + this.naked_title, ": pagina kan niet gelezen worden", ""]
                return Promise.reject(Error(this.status_message.join(" ")))
            }

            // Rewrite the links/transclusions on the live page
            let rewriter = new PrefixRewriter(this.staging_prefix, this.live_prefix)
            let wikitext = rewriter.rewrite(text_query["wikitext"])
            let edit = await browser.tabs.sendMessage(script_tab, {"type": "wikiChangeText", "page_id": new_live_id, "new_text": wikitext, "is_minor": true, "summary": "Switchting staging environment to live"})
            if (edit === false) {
                this.status_message = [this.live_prefix + this.naked_title, ": pagina kan niet worden aangepast", ""]
                return Promise.reject(Error(this.status_message.join(" ")))
            }
            this.status_message = [this.staging_prefix + this.naked_title, "is gepubliceerd naar", this.live_prefix + this.naked_title]
        }
    }

    /**
     * Render a textual representation of the pair as a triplet of staging page,
     * action, live page. If the switch is already performed, this will be the
     * status message, otherwise a message is constructed.
     */
    this.render = function() {
        if (this.status_message !== null) {
            return this.status_message
        }
        if (this.live_id === null) {
            return [this.staging_prefix + this.naked_title, "wordt nieuw gepubliceerd", ""]
        } else if (this.staging_id === null) {
            return ["", "wordt verwijderd:", this.live_prefix + this.naked_title]
        } else {
            return [this.staging_prefix + this.naked_title, "vervangt", this.live_prefix + this.naked_title]
        }
   }
}