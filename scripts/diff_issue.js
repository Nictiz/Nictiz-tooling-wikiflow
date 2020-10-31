(async function() {
    // Guard variable
    if (window.has_run) {
        return;
    }
    window.has_run = true;

    // Parse the url to see which page we're on
    let url_parts = /index.php\?title=MedMij:(Vprepub\/|V2019.01_)(.*?)(&*)?&action=edit/.exec(window.location.href)
    if (url_parts == null) return

    let wiki_api = new WikiApi()

    // Containers for the issue page information in the original and the modified state
    let issue_info    = null
    let ancestor_info = null

    // The textarea of the editor component
    let textarea = document.getElementById("wpTextbox1")

    // The original wikitext of this (prepub) page
    const orig_wikitext = textarea.textContent

    let issue_id     = null   // The issue we're currently merging
    let merged_text   = ""    // The text after merging
    let has_conflicts = false // Do we have merge conflicts?

    // Let's add some input validation to the form submission
    document.getElementById("editform").addEventListener("submit", (event) => {
        let summary = document.getElementById("wpSummary").value
        if (issue_id != null) {
            let proceed = true
            if (summary.length < 10) {
                proceed = confirm("De samenvatting is erg kort. Weet je zeker dat je wil doorgaan?")
            } else if (!summary.startsWith(issue_id)) {
                proceed = confirm("De samenvatting begint niet met het issue-nummer. Weet je zeker dat je wil doorgaan?")
            }
            if (!proceed) {
                event.preventDefault()
                return
            }
        }
    })

    // The namespace id for the MedMij namespace
    let namespace_id = await getMedMijNamespace()

    // Find the issues associated with this page and populate a dropdown list.
    // Further page actions are driven by user interactions with this dropdown.
    if (namespace_id != -1) {
        let issue_ids = await extractIssueIdsFromSiteInfo()
        populateIssues(issue_ids)
    }

    /** Retrieve the MedMij namespace using the API */
    async function getMedMijNamespace() {
        let ns_info = await wiki_api.query({"meta": "siteinfo", "siprop": "namespaces"})
        if (ns_info != null) {
            for (let ns_id in ns_info.namespaces) {
                if (ns_info.namespaces[ns_id].canonical == "MedMij") {
                    return ns_id
                }
            }
        }

        return -1
    }

    /**
     * Find all issues we can integrate here by searching for issue pages
     * with the same title.
     */
    async function extractIssueIdsFromSiteInfo() {
        let issue_ids = []

        // Inspect all pages starting with Vissue in this namespace
        let info = await wiki_api.query({"list": "prefixsearch", "pssearch": "Vissue", "psnamespace": namespace_id, "pslimit": 500})
        if (info != null) {
            // In the URL, spaces are replaced by underscores, so to get the
            // title, we have, to replace them
            let naked_page_title = url_parts[2].replace(new RegExp("_", "g"), " ")
            for (let key in info.prefixsearch) {
                // If the end of the title matches the end of _our_ title,
                // extract the issue number from the title and store it.
                let issue = info.prefixsearch[key]
                if (issue.title.endsWith(naked_page_title)) {
                    let title_parts = /MedMij:Vissue-(.*?)\//.exec(issue.title)
                    if (title_parts != null && title_parts.length > 1) {
                        issue_ids.push(title_parts[1])
                    } else {
                        console.log("Couldn't extract issue num from '" + issue.title + "'")
                    }
                }
            }
        } else {
            console.log("Couldn't query the pages in the MedMij namespace")
        }
        return issue_ids
    }

    /**
     * If there are issues available, inject a dropdown list in the page to
     * integrate them.
     * @param issue_ids an array with the issue ids
     */
    function populateIssues(issue_ids) {
        if (issue_ids.length > 0) {
            let dropdown = document.createElement("select")
            dropdown.setAttribute("id", "issue_dropdown")
            
            // The "none" option
            let option = document.createElement("option")
            option.setAttribute("value", "none")
            option.setAttribute("selected", "true")
            option.innerHTML = "None"
            dropdown.appendChild(option)

            // Attach issue ids as options
            issue_ids.forEach(issue_id => {
                let option = document.createElement("option")
                option.setAttribute("value", issue_id)
                option.innerHTML = issue_id
                dropdown.appendChild(option)
            })
            
            let label = document.createElement("label")
            label.setAttribute("for", "issue_dropdown")
            label.innerHTML = "Integreer issue-pagina:"

            let div = document.createElement("div")
            div.appendChild(label)
            div.appendChild(dropdown)

            // We'd also like to add a checkbox to force the diff view
            let threeway_check = document.createElement("input")
            threeway_check.setAttribute("type", "checkbox")
            threeway_check.setAttribute("id", "threeway_check")
            threeway_check.onchange = function() {
                if (issue_id != null) {
                    if (threeway_check.checked) {
                        loadDiffEditor(merged_text)
                    } else if (!has_conflicts) {
                        restoreEditor(null)
                    }
                }
            }

            let threeway_label = document.createElement("label")
            threeway_label.setAttribute("for", "threeway_check")
            threeway_label.innerHTML = "Gebruik de diff-tool"

            div.appendChild(threeway_check)
            div.appendChild(threeway_label)

            dropdown.onchange = function() {
                let value = this.selectedOptions[0].value
                if (value == "none") {
                    // Reset everything to the original state
                    issue_id      = null
                    merged_text   = ""
                    has_conflicts = false
                    threeway_check.disabled = false
                    threeway_label.style.color = "black"
                    restoreEditor(orig_wikitext)
                } else {
                    issue_id = value
                    textarea.setAttribute("style", "color: grey");            
                    getWikiAndAncestorTextForIssue(value).then(() => {
                        if (issue_info != null && ancestor_info != null) {
                            autoMerge()

                            // Enable/disable the "use diff" button
                            if (has_conflicts) {
                                threeway_check.disabled = true
                                threeway_label.style.color = "gray"
                            } else {
                                threeway_check.disabled = false
                                threeway_label.style.color = "black"
                            }

                            if (has_conflicts || document.getElementById("threeway_check").checked) {
                                // If we have conflicts, load the three way diff to manually resolve 
                                // them, with as much already merged as possible
                                loadDiffEditor(merged_text)
                            } else {
                                // Otherwise, load the new text to the editor
                                restoreEditor(merged_text)
                            }
                    
                        }
                    })
                }
            }

            let heading = document.getElementById("firstHeading")
            heading.insertAdjacentElement("afterend", div)

            // If the "merge_issue" parameter is given, select the specified issue
            let params = new URLSearchParams(window.location.href)
            if (params.has("merge_issue")) {
                dropdown.querySelector("option[value='" + params.get("merge_issue") + "']").selected = true
                dropdown.onchange()
            }
        }
    }

    /** Restore the editor area to its initial state.
     *  @param new_text an optional parameter to fill the textare with
     */
    function restoreEditor(new_text) {
        let editor = document.getElementsByClassName("wikiEditor-ui-view-wikitext")[0] // The entire editor component
        editor.childNodes.forEach(child => child.style.display = "block")
        if (new_text != null) {
            textarea.textContent = new_text
        }
        for (let element of document.getElementsByClassName("CodeMirror-merge")) {
            element.remove()
        }
        let header = document.getElementById("CodeMirror-header")
        if (header != null) header.remove()

        textarea.setAttribute("style", "color: black");
    }

    /** Get the issue text for the selected issue in the issue box, plus the
     *  common ancestor for these pages. */
    async function getWikiAndAncestorTextForIssue(issue_id) {
        issue_info    = null
        ancestor_info = null // We could reuse a previous answer, but for now lets not make it too complex
        issue_info = await wiki_api.getWikiText("page=MedMij:Vissue-" + issue_id + "/" + url_parts[2])
        if (issue_info != null) {
            // The issue box will differ between the issue and the prepub page,
            // so lets convert it already
            issue_info.wikitext = changeIssueBoxToPrepub(issue_info.wikitext)

            // Now reconstruct the common ancestor by going back to the
            // first revision.
            let issue_revisions = await wiki_api.getPageRevisions(issue_info["pageid"])
            if (issue_revisions != null) {
                let first_revision = issue_revisions[issue_revisions.length - 1].revid
                ancestor_info = await wiki_api.getWikiText("oldid=" + first_revision)
                if (ancestor_info != null) {
                    if (url_parts[1] === "Vprepub/") {
                        ancestor_info.wikitext = changeIssueBoxToPrepub(ancestor_info.wikitext)
                    } else {
                        // Temporary, I hope, to allow for merging to V2019.01
                        ancestor_info.wikitext = ancestor_info.wikitext.replace(/{{MedMij:Vissue\/Issuebox(.*?)\|.*?}}/, "{{MedMij:V2019.01_Issuebox$1}}")
                    }
                }

            }
        }
    }

    /**
     * Try to automatically merge the text from the issue page and the text on
     * this page, given the common ancestor. This will set the fields merged_text
     * and has_conflicts
     */
    function autoMerge() {
        // We use the node-diff library, which seems the only working solution
        // to do three-way merges in JS.
        // Unfortunately, it doesn't do exactly what we want: instead of
        // doing a three-way text merge and err on conflict, it merges three
        // arrays of atoms and returns alternating failure and success objects.
        // To keep our whitespaces intact, we use a low granularity of
        // entire paragraphs as our atoms. This means that if there is a 
        // conflict somewhere in a paragraph, it has to be resolved manually.
        let changes = Diff3.diff3Merge(orig_wikitext, ancestor_info["wikitext"], issue_info["wikitext"], {
            excludeFalseConflicts: true,
            stringSeparator: /\n/
        })

        has_conflicts = false
        merged_text = ""
        changes.forEach(change => {
            if ("conflict" in change) {
                has_conflicts = true
                // Add the original text to the merged text
                change.conflict.o.forEach(chunk => merged_text += chunk + "\n")
            } else {
                // Add the hunk to the merged text
                change.ok.forEach(chunk => merged_text += chunk + "\n")
            }
        })
    }

    /**
     * Replace the normal wiki editor with a CodeMirror three-way diff editor,
     * containing the current content, the content of the selected issue on the
     * left, and the content of the original situation on the right.
     */
    function loadDiffEditor(merged) {
        if (issue_info != null && ancestor_info != null) {
            // Hide the normal wiki editor
            let editor = document.getElementsByClassName("wikiEditor-ui-view-wikitext")[0] // The entire editor component
            editor.childNodes.forEach(child => child.style.display = "none")

            // Remove the CodeMirror if we selected a previous issue to
            // integrate (because we don't know how to reuse an existing one)
            for (let element of document.getElementsByClassName("CodeMirror-merge")) {
                element.remove()
            }

            // Instead, insert the CodeMirror MergeView with the three components
            let code_mirror = CodeMirror.MergeView(editor,
                {
                    "value": merged,
                    "origLeft": issue_info["wikitext"],
                    "origRight": orig_wikitext,
                    "lineWrapping": true,
                    "lineNumbers": true,
                    "connect": "align",
                    "collapseIdentical": true
                }
            )
            let header = document.createElement("table")
            header.setAttribute("style", "width: 100%; text-align: center;")
            header.setAttribute("id", "CodeMirror-header")
            header.innerHTML = "<tr><td style='width: 33%;'>Issue-tekst</td><td style='width: 33%;'>Nieuwe tekst</td><td style='width: 33%;'>Huidige Vprepub</td></tr>"
            editor.insertAdjacentElement("afterbegin", header)

            // Mirror all changes in the CodeMirror editor to the hidden wiki 
            // editor, where it can be picked up by the other functionality
            // of the edit page. Rather crude, but it will do for now.
            textarea.textContent = merged
            code_mirror.editor().on("change", function() {
                textarea.textContent = code_mirror.editor().getValue()
            })
        }
    }

    function changeIssueBoxToPrepub(text) {
        return text.replace(/{{MedMij:Vissue\/Issuebox(.*?)\|.*?}}/, "{{MedMij:Vprepub/Issuebox$1}}")
    }

})()