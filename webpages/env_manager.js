/**
 * Code to switch environments, which means that all "live" pages, identified by a specified prefix, are deleted, and
 * all "prepub" pages, starting with another prefix, are duplicated to the "live" prefix, rewriting links and
 * transclusions to this new prefix.
 * 
 * This script cannot work on its own, there should be a tab with a content script running on a wiki page to perform
 * the wiki api operations in the proper context, which is set in the background script. 
 */

// Wait till we have the id of the tab where the content script runs before we proceed
browser.runtime.getBackgroundPage().then(page => {
    // Store the script tab in a global page variable so we can use it to communicate with the background script
    script_tab = page.script_tab_id

    let manage_ui = new ManageUI()
})

class ManageUI {
    /**
     * Interface between the UI and the functional aspects.
     */
    constructor() {
        this.migrator = new Migrator()

        this.source_input = document.getElementById("prefix_source")
        this.target_input = document.getElementById("prefix_target")
        this.source_input.addEventListener("input", () => {this._tryPrefixes()})
        this.target_input.addEventListener("input", () => {this._tryPrefixes()})

        this.button_search = document.getElementById("button_search")
        this.button_action = document.getElementById("button_action")

        this.error_box = document.getElementById("error")
        this.pairs_table = document.getElementById("pairs_table")

        // Check if we have permissions to perform operations. If not, we can still perform all the searches, but the
        // button to perform the action will remain inactive.
        this.has_permissions = false
        browser.tabs.sendMessage(script_tab, {
            type: "wikiQuery", payload: {
                meta: "userinfo", uiprop: "rights"
            }
        }).then(result => {
            let user_box = document.getElementById("user_box")
            if (result.userinfo.id != "0") {
                user_box.innerHTML = `Ingelogd als ${result.userinfo.name}`
            } else {
                user_box.innerHTML = "Niet ingelogd"
            }
            if (result.userinfo.id == "0" || !"delete" in result.userinfo.rights && !"duplicate" in result.userinfo.rights) {
                this._showError("Onvoldoende rechten om bewerkingen te kunnen uitvoeren")
            } else {
                this.has_permissions = true
            }
        })

        this.action_button_texts = {}
        this.action_button_texts[this.migrator.ACTIONS.publish]       = "Publiceer"
        this.action_button_texts[this.migrator.ACTIONS.create_prepub] = "Aanmaken"
        this.action_button_texts[this.migrator.ACTIONS.duplicate]     = "Dupliceren"
        this.action_button_texts[this.migrator.ACTIONS.delete]        = "Verwijderen"

        // Attach event listeners to the radio buttons
        document.querySelectorAll("input[type='radio'][name='action']").forEach(element => {
            element.addEventListener("change", event => {
                this.migrator.setAction(event.target.value)
                if (event.target.value == this.migrator.ACTIONS.duplicate) {
                    this.target_input.removeAttribute("disabled")
                } else {
                    this.target_input.setAttribute("disabled", "disabled")
                }
                this._tryPrefixes()
                this.button_action.innerHTML = this.action_button_texts[event.target.value]
            })
        })
        document.querySelector("input[type='radio'][name='action'][value='publish_prepub']").dispatchEvent(new Event("change"))

        // Event listener for the search button
        button_search.addEventListener("click", (event) => {
            this.pairs_table.innerHTML = ""
        
            this.migrator.collectPages().then(pairs => {
                // Display each found pair in the pairs table on its own row, together with a checkbox to include or
                // exclude it. The text and number of colums depends on the type of action we want to take.
                pairs.forEach(pair => {
                    let tr = document.createElement("tr")
                    let inner_html = "<td><input type='checkbox' checked></td>"

                    if (this.migrator.action == this.migrator.ACTIONS.publish) {
                        if (pair.source_title) {
                            if (pair.target_id) {
                                inner_html += `<td>${pair.source_title}</td><td>vervangt</td><td>${pair.target_title}</td>`
                            } else {
                                inner_html += `<td>${pair.source_title}</td><td>wordt gepubliceerd als</td><td>${pair.target_title}</td>`
                            }
                        } else {
                            inner_html += `<td></td><td>wordt verwijderd:</td><td>${pair.target_title}</td>`
                        }
                    } else if (this.migrator.action == this.migrator.ACTIONS.create_prepub || this.migrator.action == this.migrator.ACTIONS.duplicate) {
                        if (pair.target_id) {
                            throw "Er bestaan al pagina's in de doelomgeving"
                        }
                        inner_html += `<td>${pair.source_title}</td><td>wordt gedupliceerd als</td><td>${pair.target_title}</td>`
                    } else if (this.migrator.action == this.migrator.ACTIONS.delete) {
                        inner_html += `<td>${pair.source_title}</td><td>wordt verwijderd</td>`
                    }
                    tr.innerHTML = inner_html
                    this.pairs_table.appendChild(tr)
                })

                if (this.has_permissions) {
                    this.button_action.innerHTML = this.action_button_texts[this.migrator.action]
                    this.button_action.removeAttribute("disabled")
                }
            }).catch(error => {
                this._showError(error)
            })
        })

        // Event listener for the action button
        this.button_action.addEventListener("click", async event => {
            this._showError(false)
            this.button_search.setAttribute("disabled", "disabled")
            this.button_action.setAttribute("disabled", "disabled")
            this.button_action.innerHTML = "Bezig ..."

            // Construct a list of indexes which should be included/excluded from the checkboxes in the pairs table.
            let active_indexes = []
            let rows = document.getElementById("pairs_table").getElementsByTagName("tr")
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].querySelector("input[type='checkbox']:checked") === null) {
                    active_indexes.push(false)
                } else {
                    active_indexes.push(true)
                }
            }

            // Perform the action and report each outcome to the pairs table
            this.migrator.performAction(active_indexes, (index, is_successful, pair) => {
                let tr = document.getElementById("pairs_table").getElementsByTagName("tr")[index]
                tr.className = is_successful ? "success" : "failure"

                let message_html = ""

                if (this.migrator.action == this.migrator.ACTIONS.delete) {
                    if (is_successful) {
                        message_html = "pagina is verwijderd"
                    } else {
                        message_html = "kon pagina niet verwijderen"
                    }
                } else {
                    // These operations consist of multiple steps, so we build a list of steps that have
                    // succeeded/failed.
                    message_html = "<ul>"

                    let proceed = true // Make sure we stop after a failed action
                    if (this.migrator.action == this.migrator.ACTIONS.publish) {
                        if (pair.target_id) {
                            if (pair.target_deleted) {
                                message_html += "<li>oorspronkelijke pagina verwijderd</li>"
                            } else {
                                message_html += "<li>kon oorspronkelijke pagina niet verwijderen</li>"
                                proceed = false
                            }
                        }
                    }
                    if (proceed) {
                        if (pair.source_duplicated) {
                            message_html += `<li>bronpagina gedupliceerd naar ${pair.target_title}</li>`
                        } else {
                            message_html += "<li>kon bronpagina niet dupliceren</li>"
                            proceed = false
                        }
                    }
            
                    if (proceed) {
                        if (pair.target_rewritten) {
                            message_html += "<li>links herschreven</li>"
                            if (pair.target_contains_prefix_from) {
                                message_html += "<li class='warning'>De nieuwe pagina bevat nog (ergens) de oorspronkelijke prefix!</li>"
                            }
                        } else {
                            message_html += "<li>kon links niet herschrijven</li>"
                        }
                    }

                    message_html += "</ul>"
                }
        
                let inner_html = "<td></td>" // Skip first cell to align with the checkboxes in the first cell
                if (pair.source_id) {
                    inner_html += `<td>${pair.source_title}</td>`
                } else {
                    inner_html += "<td></td>"
                }
                inner_html += `<td>${message_html}</td>`
                tr.innerHTML = inner_html
            }).then(() => {
                this.button_search.removeAttribute("disabled")
                this.button_action.innerHTML = "Gereed"
            })
        })
    }

    /**
     * Communicate the prefixes from the input box(es) to the Migrator and clear the interface of information
     * pertaining to the previous prefixes.
     * When the prefix is rejected, the error is displayed in the error box.
     * @returns true when the prefixes are set or false if they are rejected.
     */
    _tryPrefixes() {
        this.pairs_table.innerHTML = ""
        try {
            this.migrator.setPrefixes(this.source_input.value, this.target_input.value)
            this.source_input.setCustomValidity("")
            this.target_input.setCustomValidity("")
            if (this.target_input.getAttribute("disabled") == null) {
                this.target_input.value = this.migrator.target_prefix
            }
            this.button_search.removeAttribute("disabled")
            this.button_action.setAttribute("disabled", "disabled")
        } catch (error) {
            if (error instanceof PrefixError) {
                if (error.kind == "source") {
                    this.source_input.setCustomValidity(error.message)
                } else if (error.kind == "target") {
                    this.target_input.setCustomValidity(error.message)
                }
                this.button_search.setAttribute("disabled", "disabled")
                return false    
            } else {
                throw error
            }
        }

        return true
    }

    /**
     * Display an error message, using the dedicated div.
     * @param msg the message to display
     */
    _showError(msg) {
        if (msg == false) {
            this.error_box.style.display = "none"
        } else {
            if (msg instanceof Error) {
                msg = msg.message
            }
            this.error_box.innerHTML = msg
            this.error_box.style.display = "block"
        }
    }        
}

class PrefixError extends Error {
    /**
     * Custom error for prefixes that aren't in the proper format.
     * @param {string} kind - the kind of prefix that is being set (arbitrary string)
     * @param {string} message - the error message
     */
    constructor(kind, message) {
        super(message)
        this.kind = kind
    }
}

class Migrator {
    /**
     * The main functionality managing an environment.
     *
     * There are four actions that can be taken, as enumerated in Migrator.ACTIONS:
     * - publish: publish an existing prepub environment to the corresponding live prefix. 
     * - create_prepub: duplicate an environment to the corresponding prepub prefix.
     * - duplicate: duplicate an arbitrary environment to an arbitrary prefix.
     * - delete: delete an arbitrary environment.
     * 
     * For each action, sanity checks are done and links are rewritten on duplication.
     */
    constructor() {
        this.ACTIONS = {
            publish:       "publish_prepub",
            create_prepub: "create_prepub",
            duplicate:     "duplicate_env",
            delete:        "delete_env"
        }
        this.action = this.ACTIONS.publish
        
        this.source_prefix = null
        this.target_prefix = null

        this.pairs = []
    }

    /**
     * Set the action to take
     * @param {Migrator.ACTIONS} migrator_action
     */
    setAction(migrator_action) {
        this.action = migrator_action
    }

    /**
     * Set the source and optionally the target prefix. The prefixes are checked according to their use for the current
     * selected action.
     * @param {string} source_prefix - the source prefix to set.
     * @param {string} [target_prefix] - this is only required when the action in "duplicate", otherwise the
     *                                   target_prefix is unneeded or will be generated.
     * @throws {Error} - when the input is not fit for the intended action.
     */
    setPrefixes(source_prefix, target_prefix) {        
        if (this.action == this.ACTIONS.duplicate) {
            this.source_prefix = source_prefix
            this.target_prefix = target_prefix
        } else if (this.action == this.ACTIONS.delete) {
            this.source_prefix = source_prefix
            this.target_prefix = null
        } else {
            let parts = source_prefix.match(/([A-Za-z]+:)?V(prepub-)?([A-Za-z0-9\.]+?)[\/_]?$/)
            if (parts == null) {
                throw new PrefixError("source", "Geen valide prefix")
            }

            if (this.action == this.ACTIONS.publish) {
                if (parts[2] == null) {
                    throw new PrefixError("source", "Geen valide prefix voor prepub-omgevingen")
                }
                this.source_prefix = source_prefix
                this.target_prefix = parts[1] + "V" + parts[3]
            } else if (this.action == this.ACTIONS.create_prepub) {
                if (parts[2] != null) {
                    throw new PrefixError("source", "Prefix is al een prepub-omgeving")
                }
                this.source_prefix = source_prefix
                this.target_prefix = parts[1] + "Vprepub-" + parts[3]
            }
        }

        this.pairs = []
    }

    /** 
     * Collect the source and optionally target pages, and store them as a list of Pair objects in this.pairs.
     * @returns {Promise<[Pair]>} - the Pair objects found
     */
    async collectPages() {
        this.pairs = []

        // Search for source and target pages, and wait untill we have them all.
        let source_pages = {}
        let target_pages = {}
        let searches = []
        searches.push(
            this._collectPrefixedPages(this.source_prefix).then(pages => source_pages = pages)
        )
        if (this.target_prefix) {
            searches.push(
                this._collectPrefixedPages(this.target_prefix).then(pages => target_pages = pages)
            )
        }
        await Promise.all(searches)
        
        // Match all source pages to target pages, or store them as unmatched Pair
        while (Object.keys(source_pages).length) {
            let source_title = Object.keys(source_pages)[0]
            let naked_title  = source_title.replace(this.source_prefix, "")
            let target_title = this.target_prefix + naked_title
            let target_id    = null
            if (target_title in target_pages) {
                target_id = target_pages[target_title]
                delete target_pages[target_title]
            }
            this.pairs.push(new Pair(source_title, source_pages[source_title], target_title, target_id))
            delete source_pages[source_title]
        }
        // Add remaining prepub pages as unbalanced Pair's
        for (const target_title in target_pages) {
            this.pairs.push(new Pair(null, null, target_title, target_pages[target_title]))
        }

        return this.pairs
    }

    /**
     * Helper method to collect all pages on the wiki starting with a given prefix.
     * @param {string} prefix - Search pages starting with this prefix. 
     * @returns {Promise<Object|Error>} - an object with page ids as key and page title as value
     */
    async _collectPrefixedPages(prefix) {
        let payload = {"list": "prefixsearch", "pslimit": 500, "pssearch": prefix}
        let result = await browser.tabs.sendMessage(script_tab, {"type": "wikiQuery", "payload": payload})

        let pages = {}
        for (const page_num in result["prefixsearch"]) {
            let page = result["prefixsearch"][page_num]
            pages[page.title] = page.pageid
        }

        return pages
    }

    /**
     * Perform the intended action on all Pair objects in this.pairs.
     * @param {[boolean]} active_indexes - Indicate for each index in this.pairs whether it should be included.
     * @param {function} ui_callback - Callback function for the ui which takes the index, the status and Pair object.
     */
    async performAction(active_indexes, ui_callback) {
        let actions = []

        for (let i = 0; i < this.pairs.length; i++) {
            if (active_indexes[i]) {
                let pair = this.pairs[i]

                let action = null
                if (this.action == this.ACTIONS.publish) {
                    action = pair.delete("target").then(() => {
                        return pair.duplicate(this.source_prefix, this.target_prefix, "Publish prepub to live environment", true)
                    }).then(() => {
                        ui_callback(i, true, pair)
                    }).catch(err => {
                        console.log(err)
                        ui_callback(i, false, pair)
                    })
                } else if (this.action == this.ACTIONS.create_prepub || this.action == this.ACTIONS.duplicate) {
                    let summary        = ""
                    let allow_indexing = null
                    if (this.action == this.ACTIONS.create_prepub) {
                        summary = `Create prepub environment from ${this.source_prefix}`
                        allow_indexing = false
                    } else {
                        summary = `Duplicate ${this.source_prefix} environment to ${this.target_prefix}`
                    }
                    action = pair.duplicate(this.source_prefix, this.target_prefix, summary, allow_indexing).then(() => {
                        ui_callback(i, true, pair)
                    }).catch(err => {
                        console.log(err)
                        ui_callback(i, false, pair)
                    })   
                } else if (this.action == this.ACTIONS.delete) {
                    action = pair.delete("source").then(() => {
                        ui_callback(i, true, pair)
                    }).catch(err => {
                        console.log(err)
                        ui_callback(i, false, pair)
                    })   
                }
                actions.push(action)
            }
        }
        await Promise.all(actions)
    }
}

class Pair {
    /**
     * A pair of a source page and a target page, with title and id. All of these fields are optional depending on
     * the required action and obtained values.
     *
     * The methods delete(), duplicate() and switch() can be used to manipulate the actual pages. These operations
     * may consist of several substeps. The status of each substep is captured in a flag. See the documention on these
     * methods.
     * 
     * @param {string} [source_title] - The title of the source page. If null, there is no source page.
     * @param {number} [source_id] - The page id of the source page. If null, the page doesn't actually exist.
     * @param {string} [target_title] - The title for the target page. If null, there is no target page.
     * @param {number} [target_id] - The page id of the target page. If null, the page doesn't exist.
     */
    constructor(source_title, source_id, target_title, target_id) {
        this.source_title = source_title
        this.source_id    = source_id
        this.target_title = target_title
        this.target_id    = target_id

        this.source_deleted              = false
        this.target_deleted              = false
        this.source_duplicated           = false
        this.target_rewritten            = false
        this.target_contains_prefix_from = false
    }

    /**
     * Delete either the source or the target. If the page doesn't exist, this method doesn't have an effect.
     * This method will set the flags this.source_deleted or this.target_deleted.
     * @param {(source|target)} which - indicate if the source or the target should be deleted.
     */
    async delete(which) {
        let id = (which == "source") ? this.source_id : this.target_id
        if (id !== null) {
            await browser.tabs.sendMessage(script_tab, {"type": "wikiDeletePage", "page_id": id})
            if (which == "source") {
                this.source_deleted = true
            } else {
                this.target_deleted = true
            }
        }
    }

    /**
     * Duplicate the source page to the target page, preserving full history and rewriting the links.
     * This method will set the flags this.source_duplicated and this.target_rewritten.
     * @param {string} source_prefix - The link prefix to rewrite
     * @param {string} target_prefix - The link prefix to rewrite source_prefix to 
     * @param {string} rewrite_summary - The page summary when performing the rewrite
     * @param {boolean|null} [allow_indexing] - if true, remove the __NOINDEX__ magic keyword(s) from the new page, if
     *                                          false, add it if it isn't there yet. If null, the __NOINDEX__ tags will
     *                                          not be affected. 
     */
    async duplicate(source_prefix, target_prefix, rewrite_summary, allow_indexing = null) {
        await browser.tabs.sendMessage(script_tab, {type: "wikiDuplicatePage", title: this.source_title, new_title: this.target_title})
        this.source_duplicated = true

        // Get the id of the new live page
        let payload = {"titles": this.target_title}
        let id_query = await browser.tabs.sendMessage(script_tab, {type: "wikiQuery", payload: payload})
        let new_page_id = Object.keys(id_query["pages"])[0]

        // Get the wikitext of the new live page
        let text_query = await browser.tabs.sendMessage(script_tab, {type: "wikiGetText", query_key: {pageid: new_page_id}})

        // Rewrite the links/transclusions on the live page and add/remove the __NOINDEX__ tag
        let rewriter = new PrefixRewriter(source_prefix, target_prefix)
        let wikitext = rewriter.rewrite(text_query["wikitext"])
        if (allow_indexing !== null) {
            if (allow_indexing) {
                wikitext = wikitext.replace(new RegExp(/^\s*__NOINDEX__\s*$\n/, "gm"), "") // Remove lines that only consists of __NOINDEX__, without leaving an empty line behind 
                wikitext = wikitext.replace(new RegExp(/__NOINDEX__/, "g"), "")            // Remove __NOINDEX__ from lines that also contain other text
            } else {
                if (!wikitext.match("__NOINDEX__")) {
                    wikitext = "__NOINDEX__\n" + wikitext
                }
            }
        }
        await browser.tabs.sendMessage(script_tab, {type: "wikiChangeText", page_id: new_page_id, new_text: wikitext, is_minor: true, summary: rewrite_summary})
        this.target_rewritten            = true
        this.target_contains_prefix_from = rewriter.containsPrefixFrom(wikitext)
    }
}
