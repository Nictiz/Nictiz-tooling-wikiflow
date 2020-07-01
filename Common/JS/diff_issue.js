(function() {
    // Guard variable
    if (window.has_run) {
        return;
    }
    window.has_run = true;

    // Parse the url to see which page we're on
    let url_parts = /index.php\?title=MedMij:Vprepub_(.*?)(&*)?&action=edit/.exec(window.location.href)
    if (url_parts == null) return

    let wiki_api = new WikiApi()

    // Containers for the issue page information in the original and the modified state
    let ancestor_info = null
    let issue_info    = null

    // The textarea of the editor component
    let textarea = document.getElementById("wpTextbox1")

    // The original wikitext of this page
    const orig_wikitext = textarea.textContent

    // The MedMij namespace id
    let namespace_id = -1

    // Because we're using (required) asynchronous API calls, the rest of the
    // process is a web of callbacks. Let's kickstart the process bu getting
    // the MedMij namespace
    wiki_api.query({"meta": "siteinfo", "siprop": "namespaces"}, ns_info => {
        if (ns_info != null) {
            for (let ns_id in ns_info.namespaces) {
                if (ns_info.namespaces[ns_id].canonical == "MedMij") {
                    namespace_id = ns_id
                    break
                }
            }
        }

        // If we know the namespace, the next step is to search for issue pages
        if (namespace_id != -1) {
            extractIssueIdsFromSiteInfo()
        } else {
            console.log("Couldn't get the MedMij namespace id")
        }
    })

    /**
     * Find all issues we can integrate here by searching for issue pages
     * with the same title.
     */
    function extractIssueIdsFromSiteInfo() {
        let issue_nums = []

        // Inspect all pages starting with Vissue in this namespace
        wiki_api.query({"list": "prefixsearch", "pssearch": "Vissue", "psnamespace": namespace_id}, info => {
            if (info != null) {
                // In the URL, spaces are replaced by underscores, so to get
                // the title, we have, to replace them
                let naked_page_title = url_parts[1].replace(new RegExp("_", "g"), " ")
                for (let key in info.prefixsearch) {
                    // If the end of the title matches the end of _our_ title,
                    // extract the issue number from the title and store it.
                    let issue = info.prefixsearch[key]
                    if (issue.title.endsWith(naked_page_title)) {
                        let title_parts = /MedMij:Vissue-(.*?) /.exec(issue.title)
                        if (title_parts != null && title_parts.length > 1) {
                            issue_nums.push(title_parts[1])
                        } else {
                            console.log("Couldn't extract issue num from '" + issue.title + "'")
                        }
                    }
                }

                // Next in line is to add a dropdown with the issue id's to the
                // page. This concludes the modification of the page, the next
                // action is triggered when the user selects an issue.
                populateIssues(issue_nums)
            } else {
                console.log("Couldn't query the pages in the MedMij namespace")
            }
        })
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
            dropdown.onchange = function() {
                let value = this.selectedOptions[0].value
                if (value == "none") {
                    restoreEditor()
                } else {
                    getWikiTextForIssue(value)
                }
            }
            
            let label = document.createElement("label")
            label.setAttribute("for", "issue_dropdown")
            label.innerHTML = "Integreer issue-pagina:"

            let div = document.createElement("div")
            div.appendChild(label)
            div.appendChild(dropdown)

            let heading = document.getElementById("firstHeading")
            heading.insertAdjacentElement("afterend", div)
        }
    }

    function restoreEditor() {
        let editor = document.getElementsByClassName("wikiEditor-ui-view-wikitext")[0] // The entire editor component
        editor.childNodes.forEach(child => child.style.display = "block")
        textarea.textContent = orig_wikitext
        for (let element of document.getElementsByClassName("CodeMirror-merge")) {
            element.remove()
        }
        let header = document.getElementById("CodeMirror-header")
        if (header != null) header.remove()
    }

    /** Get the issue text for the selected issue in the issue box, plus the
     *  common ancestor for these pages. */
    function getWikiTextForIssue(issue_id) {
        issue_info    = null
        ancestor_info = null // We could reuse a previous answer, but for now lets not make it too complex
        wiki_api.getWikiText("page=MedMij:Vissue-" + issue_id + "_" + url_parts[1], response => {
            issue_info = response // Save for the next function
            if (issue_info != null) {
                // The issue box will differ between the issue and the prepub page,
                // so lets convert it already
                issue_info.wikitext = changeIssueBoxToPrepub(issue_info.wikitext)

                // Now reconstruct the common ancestor by going back to the
                // first revision.
                wiki_api.getPageRevisions(issue_info["pageid"], issue_revisions => {
                    if (issue_revisions != null) {
                        let first_revision = issue_revisions[issue_revisions.length - 1].revid
                        wiki_api.getWikiText("oldid=" + first_revision, response => {
                            ancestor_info = response // Save for the next function

                            if (ancestor_info != null) {
                                ancestor_info.wikitext = changeIssueBoxToPrepub(ancestor_info.wikitext)

                                // Now that we have the issue text plus common
                                // ancestor, it's to to see if we can merge the
                                // two.
                                autoMerge()
                            }
                        })
                    }
                })
            }
        })
    }

    /**
     * Try to automatically merge the text from the issue page and the text on
     * this page, given the common ancestor.
     * On success, the editor will be replaced by the merged text. On failure,
     * a manual three-way merge editor will be opened.
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

        let has_conflicts = false
        let merged = ""
        changes.forEach(change => {
            if ("conflict" in change) {
                has_conflicts = true
                // Add the original text to the merged text
                change.conflict.o.forEach(chunk => merged += chunk + "\n")
            } else {
                // Add the hunk to the merged text
                change.ok.forEach(chunk => merged += chunk + "\n")
            }
        })

        if (has_conflicts) {
            // If we have conflicts, load a three way diff to manually resolve 
            // them, with as much already merged as possible
            loadDiffEditor(merged)
        } else {
            // Otherwise, load the new text to the editor
            restoreEditor()
            textarea.textContent = merged
        }
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
            code_mirror.editor().on("change", function() {
                textarea.textContent = code_mirror.editor().getValue()
            })
        }
    }

    function changeIssueBoxToPrepub(text) {
        return text.replace(/{{MedMij:Vissue_Issuebox(.*?)\|.*?}}/, "{{MedMij:Vdraft_Issuebox$1}}")
    }
})()