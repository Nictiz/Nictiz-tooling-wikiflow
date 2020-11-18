class IssueIntegrator {
    constructor(url_analyzer) {
        this.url_analyzer = url_analyzer

        this.wiki_api = new WikiApi()

        // Containers for the issue page information in the original and the modified state
        this.issue_info    = null
        this.ancestor_info = null

        // The textarea of the editor component
        this.textarea = document.getElementById("wpTextbox1")

        // The original wikitext of this (prepub) page
        this.orig_wikitext = this.textarea.textContent

        this.issue_id      = null  // The issue we're currently merging
        this.merged_text   = ""    // The text after merging
        this.has_conflicts = false // Do we have merge conflicts?

        // Let's add some input validation to the form submission
        document.getElementById("editform").addEventListener("submit", (event) => {
            let summary = document.getElementById("wpSummary").value
            if (this.issue_id != null) {
                let proceed = true
                if (summary.length < 10) {
                    proceed = confirm("De samenvatting is erg kort. Weet je zeker dat je wil doorgaan?")
                } else if (!summary.startsWith(this.issue_id)) {
                    proceed = confirm("De samenvatting begint niet met het issue-nummer. Weet je zeker dat je wil doorgaan?")
                }
                if (!proceed) {
                    event.preventDefault()
                    return
                }
            }
        })
    }

    integrate() {
        this.wiki_api.query({"prop": "info", "titles": this.url_analyzer.namespace + this.url_analyzer.title}).then(result => {
            try {
                return result["pages"]["-1"]["ns"]
            } catch (error) {
                console.log(error)
                throw new Error("Namespace couldn't be found")
            }
        }).then(namespace_id => {
            return this.extractIssueIdsFromSiteInfo(namespace_id)
        }).then(issue_ids => {
            this.populateIssues(issue_ids)

            // If the "merge_issue" URL parameter is given, select the specified issue
            if (this.url_analyzer.search_params.has("merge_issue")) {
                let dropdown = document.getElementById("issue_dropdown")
                dropdown.querySelector("option[value='" + this.url_analyzer.search_params.get("merge_issue") + "']").selected = true
                dropdown.dispatchEvent(new Event("change"))
            }
        }).catch(err => console.log(err))
    }

    /**
     * Find all issues we can integrate here by searching for issue pages with the same title.
     * @param {number} namespace_id - The id of the Wiki namespace to search
     * @returns {Promise<[number]|Error>} A list of page ids or an error on failure
     */
    async extractIssueIdsFromSiteInfo(namespace_id) {
        let issue_ids = []

        // Inspect all pages starting with Vissue in this namespace
        let info = null
        try {
            info = await this.wiki_api.query({"list": "prefixsearch", "pssearch": "Vissue", "psnamespace": namespace_id, "pslimit": 500})
        } catch (error) {
            console.log(error)
            throw new Error("Couldn't query the pages in the MedMij namespace")
        }

        for (let key in info.prefixsearch) {
            let issue = info.prefixsearch[key]

            // In the URL, spaces are replaced by underscores, so to get the
            // title, we have, to replace them
            let issue_title = issue.title.replace(new RegExp(" ", "g"), "_")

            // If the end of the title matches the end of _our_ title,
            // extract the issue number from the title and store it.
            if (issue_title.endsWith(this.url_analyzer.separator + this.url_analyzer.title)) {
                let title_analyzer = new TitleAnalyzer()
                title_analyzer.setTitle(issue_title)
                if (title_analyzer.issue_id != null) {
                    issue_ids.push(title_analyzer.issue_id)
                } else {
                    console.log("Couldn't extract issue num from '" + issue.title + "'")
                }
            }
        }
        return issue_ids
    }

    /**
     * If there are issues available, inject a dropdown list in the page to integrate them.
     * @param {[number]} issue_ids - An array with the issue ids as found in the issue page title
     */
    populateIssues(issue_ids) {
        if (issue_ids.length > 0) {
            let dropdown = document.createElement("select")
            dropdown.setAttribute("id", "issue_dropdown")
            dropdown.addEventListener("change", event => this.selectIssue(event.target))
            
            // Add the "none" option
            let option = document.createElement("option")
            option.setAttribute("value", "none")
            option.setAttribute("selected", "true")
            option.innerHTML = "None"
            dropdown.appendChild(option)

            // Attach all issue ids as options
            issue_ids.forEach(issue_id => {
                let option = document.createElement("option")
                option.setAttribute("value", issue_id)
                option.innerHTML = issue_id
                dropdown.appendChild(option)
            })

            // Attach a label
            let dropdown_label = document.createElement("label")
            dropdown_label.setAttribute("for", "issue_dropdown")
            dropdown_label.innerHTML = "Integreer issue-pagina:"
            let div = document.createElement("div")
            div.appendChild(dropdown_label)
            div.appendChild(dropdown)

            // We'd also like to add a checkbox to force the diff view
            this.threeway_check = document.createElement("input")
            this.threeway_check.setAttribute("type", "checkbox")
            this.threeway_check.setAttribute("id", "threeway_check")
            let integrator = this // Grr ... "this" has in the callback becomes the event that caused it so we have to alias the "this-as-instance"
            this.threeway_check.addEventListener("change", () => {
                if (integrator.issue_id != null) {
                    if (integrator.threeway_check.checked) {
                        integrator.loadDiffEditor(integrator.merged_text)
                    } else if (!integrator.has_conflicts) {
                        integrator.restoreEditor(null)
                    }
                }
            })

            // Attach a label
            this.threeway_label = document.createElement("label")
            this.threeway_label.setAttribute("for", "threeway_check")
            this.threeway_label.innerHTML = "Gebruik de diff-tool"
            div.appendChild(this.threeway_check)
            div.appendChild(this.threeway_label)

            let heading = document.getElementById("firstHeading")
            heading.insertAdjacentElement("afterend", div)
        }
    }

    selectIssue(dropdown) {
        let value = dropdown.selectedOptions[0].value
        if (value == "none") {
            // Reset everything to the original state
            this.issue_id      = null
            this.merged_text   = ""
            this.has_conflicts = false
            this.threeway_check.disabled = false
            this.threeway_label.style.color = "black"
            this.restoreEditor(this.orig_wikitext)
        } else {
            this.issue_id = value
            this.textarea.setAttribute("style", "color: grey");
            this.getWikiAndAncestorTextForIssue(value).then(() => {
                if (this.issue_info != null && this.ancestor_info != null) {
                    this.autoMerge()

                    // Enable/disable the "use diff" button
                    if (this.has_conflicts) {
                        this.threeway_check.disabled = true
                        this.threeway_label.style.color = "gray"
                    } else {
                        this.threeway_check.disabled = false
                        this.threeway_label.style.color = "black"
                    }

                    if (this.has_conflicts || this.threeway_check.checked) {
                        // If we have conflicts, load the three way diff to manually resolve 
                        // them, with as much already merged as possible
                        this.loadDiffEditor(this.merged_text)
                    } else {
                        // Otherwise, load the new text to the editor
                        this.restoreEditor(this.merged_text)
                    }
            
                }
            })
        }
    }

    /** Restore the editor area to its initial state.
     *  @param new_text an optional parameter to fill the textare with
     */
    restoreEditor(new_text) {
        let editor = document.getElementsByClassName("wikiEditor-ui-view-wikitext")[0] // The entire editor component
        editor.childNodes.forEach(child => child.style.display = "block")
        if (new_text != null) {
            this.textarea.textContent = new_text
        }
        for (let element of document.getElementsByClassName("CodeMirror-merge")) {
            element.remove()
        }
        let header = document.getElementById("CodeMirror-header")
        if (header != null) header.remove()

        this.textarea.setAttribute("style", "color: black");
    }

    /** Get the issue text for the selected issue in the issue box, plus the
     *  common ancestor for these pages. */
    async getWikiAndAncestorTextForIssue(issue_id) {
        this.issue_info    = null
        this.ancestor_info = null // We could reuse a previous answer, but for now lets not make it too complex
        
        return this.wiki_api.getWikiText({page: this.url_analyzer.namespace + "Vissue-" + issue_id + this.url_analyzer.separator + this.url_analyzer.title}).then(issue_info => {
            this.issue_info = issue_info

            // The issue box will differ between the issue and the prepub page, so lets convert it already
            this.issue_info.wikitext = this.rewriteText(this.issue_info.wikitext)
        }).then(() => {
            // Now find the the first revision of this page to reconstruct the common ancestor.
            return this.wiki_api.query({"prop": "revisions", "rvlimit": 500, "pageids": this.issue_info["pageid"]})
        }).then(query => {
            let revisions = query["pages"][this.issue_info["pageid"]]["revisions"]
            let first_revision = revisions[revisions.length - 1].revid
            return this.wiki_api.getWikiText({oldid: first_revision})
        }).then(ancestor_info => {
            this.ancestor_info = ancestor_info
            // TODO: This stuff is about issueboxes, for which we need a policy
            if (this.url_analyzer.separator == "/") {
                this.ancestor_info.wikitext = this.rewriteText(this.ancestor_info.wikitext)
            } else {
                // Temporary, I hope, to allow for merging to V2019.01
                this.ancestor_info.wikitext = this.ancestor_info.wikitext.replace(/{{MedMij:Vissue\/Issuebox(.*?)\|.*?}}/, "{{MedMij:V2019.01_Issuebox$1}}")
            }
        }).catch(error => console.log(error))   
    }

    /**
     * Try to automatically merge the text from the issue page and the text on
     * this page, given the common ancestor. This will set the fields merged_text
     * and has_conflicts
     */
    autoMerge() {
        // We use the node-diff library, which seems the only working solution
        // to do three-way merges in JS.
        // Unfortunately, it doesn't do exactly what we want: instead of
        // doing a three-way text merge and err on conflict, it merges three
        // arrays of atoms and returns alternating failure and success objects.
        // To keep our whitespaces intact, we use a low granularity of
        // entire paragraphs as our atoms. This means that if there is a 
        // conflict somewhere in a paragraph, it has to be resolved manually.
        let changes = Diff3.diff3Merge(this.orig_wikitext, this.ancestor_info["wikitext"], this.issue_info["wikitext"], {
            excludeFalseConflicts: true,
            stringSeparator: /\n/
        })

        this.has_conflicts = false
        this.merged_text = ""
        changes.forEach(change => {
            if ("conflict" in change) {
                this.has_conflicts = true
                // Add the original text to the merged text
                change.conflict.o.forEach(chunk => this.merged_text += chunk + "\n")
            } else {
                // Add the hunk to the merged text
                change.ok.forEach(chunk => this.merged_text += chunk + "\n")
            }
        })
    }

    /**
     * Replace the normal wiki editor with a CodeMirror three-way diff editor,
     * containing the current content, the content of the selected issue on the
     * left, and the content of the original situation on the right.
     */
    loadDiffEditor(merged) {
        if (this.issue_info != null && this.ancestor_info != null) {
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
                    "origLeft": this.issue_info["wikitext"],
                    "origRight": this.orig_wikitext,
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
            this.textarea.textContent = merged
            code_mirror.editor().on("change", function() {
                this.textarea.textContent = code_mirror.editor().getValue()
            })
        }
    }

    /**
     * Rewrite the wiki text so that all references specific to the issue are
     * changed to Vprepub.
     * @param text the raw wikitext to rewrite
     * @returns the rewritten wikitext
     */
    rewriteText(text) {
        // Change the issuebox from the Vissue back to the Vprepub version
        let modified = text.replace(/{{MedMij:Vissue\/Issuebox(.*?)\|.*?}}/, "{{MedMij:Vprepub/Issuebox$1}}")

        // Change links and transclusions back to Vprepub
        let rewriter = new PrefixRewriter("MedMij:Vissue-[A-Za-z0-9\-\.]+", "Vprepub", true)
        modified = rewriter.rewrite(modified)

        return modified
    }

}