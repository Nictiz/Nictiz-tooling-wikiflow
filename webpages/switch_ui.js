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
    // Get the id of the tab where the content script runs
    let background_page = await browser.runtime.getBackgroundPage()
    let script_tab = background_page.script_tab_id

    // The set of live and temp pages, with page id's as key and the title of
    // the page as value
    let live_pages = {}
    let temp_pages = {}

    // When the search button is clicked, search for all live and temp pages 
    // using the prefixes specified by the user. When there are no errors and 
    // there are temp pages, enable the button to perform the switch.  
    document.getElementById("button_search").addEventListener("click", (event) => {
        document.getElementById("error").style.visibility = "hidden"
        document.getElementById("live_pages").innerHTML = "<p>De volgende pagina's worden verwijderd:</p>"
        document.getElementById("temp_pages").innerHTML = "<p>De volgende pagina's worden omgezet naar de live-omgeving</p>"

        function enableSwitchButton() {
            if (live_pages != null && temp_pages != null && Object.keys(temp_pages).length != 0) {
                document.getElementById("button_switch").removeAttribute("disabled")
            } else {
                document.getElementById("button_switch").setAttribute("disabled", "disabled")
            }
        }
    
        collectPages("live", document.getElementById("prefix_live").value).then(pages => {
            live_pages = pages
            enableSwitchButton()
        })
        collectPages("temp", document.getElementById("prefix_temp").value).then(pages => {
            temp_pages = pages
            enableSwitchButton()
        })
        event.preventDefault()
    })

    // When the switch button is clicked, delete all live pages and rename all
    // temp pages using the live prefix.
    document.getElementById("button_switch").addEventListener("click", async function(event) {
        document.getElementById("error").style.visibility = "hidden"

        let deleted = await deletePages(live_pages)
        if (!deleted) {
            showError("Niet alle pagina's konden verwijderd worden. De pagina's zijn niet omgezet.")
            return
        }

        let moved = await movePages(temp_pages, document.getElementById("prefix_temp").value, document.getElementById("prefix_live").value)
        if (!moved) {
            showError("Niet alle pagina's konden hernoemd worden.")
        }
    })

    /**
     * Collect all pages on the wiki starting with the given prefix.
     * Additionally, list them in one of the divs avalable, determined by the
     * type parameter. The listed bullets will get an id of <type>_<page_id>.
     * @param type either "temp" or "live" to indicate what type of pages we're
     *             searching for.
     * @param prefix search pages starting with this prefix. 
     * @returns an object with page ids as key and page title as value
     */
    this.collectPages = async function(type, prefix) {
        let payload = {"list": "prefixsearch", "pslimit": 500, "pssearch": prefix}
        let success = true
        let result = await browser.tabs.sendMessage(script_tab, {"type": "wikiQuery", "payload": payload}).catch(() => {success = false})
        if (!success) {
            showError("Error searching for pages")
            return false
        }

        let pages = {}

        let div = document.getElementById(type + "_pages")
        let list = document.createElement("ul")
        for (const page_num in result["prefixsearch"]) {
            let page = result["prefixsearch"][page_num]

            let item = document.createElement("li")
            item.setAttribute("id", type + "_" + page.pageid)
            item.innerHTML = page.title
            list.appendChild(item)

            pages[page.pageid] = page.title
        }
        div.appendChild(list)
        div.style.visibility = "initial"

        return pages
    }

    /**
     * Delete the specified pages. If the deletion was succesful, the displayed
     * page will be turned green, if unsuccesful it will be turned red. 
     * @param pages a list of page ids as the keys of an Object.
     * @returns true if all pages were deleted, or false if some of them
     *          weren't.
     */
    this.deletePages = async function(pages) {
        let success = true
        
        let deletings = []
        for (const page_id in pages) {
            let deleting = browser.tabs.sendMessage(script_tab, {"type": "wikiDeletePage", "page_id": page_id}).then(result => {
                if (result == true) {
                    document.getElementById("live_" + page_id).style.color = "green"
                } else {
                    document.getElementById("live_" + page_id).style.color = "red"
                    success = false
                }
            })
            deletings.push(deleting)
        }

        // Wait for all Promises to resolve
        await Promise.all(deletings)

        return success
    }

    /**
     * Move (rename) all specified pages, replacing the specified prefix in the
     * title with the new prefix 
     * @param pages a list of page ids as the keys of an Object 
     * @param old_prefix the prefix to replace
     * @param new_prefix the prefix to replace old_prefix with
     * @returns true if all pages could be moved, or false if some of them
     *          couldn't 
     */
    async function movePages(pages, old_prefix, new_prefix) {
        let success = true

        let movings = []
        for (const page_id in pages) {
            let new_title = pages[page_id].replace(old_prefix, new_prefix)
            let moving = browser.tabs.sendMessage(script_tab, {"type": "wikiMovePage", "page_id": page_id, "new_title": new_title}).then(result => {
                if (result !== false) {
                    document.getElementById("temp_" + page_id).style.color = "green"
                } else {
                    document.getElementById("temp_" + page_id).style.color = "red"
                    success = false
                }
            })
            movings.push(moving)
        }

        // Wait for all promises to resolve
        await Promise.all(movings)

        return success
    }

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