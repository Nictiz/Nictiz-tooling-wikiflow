(function() {
    // Guard variable
    if (window.has_run) {
        return;
    }
    window.has_run = true;

    // Parse the url to see which page we're on
    let url_parts = /index.php\?title=MedMij:Vprepub_(.*?)(&*)?&action=edit/.exec(window.location.href)
    if (url_parts == null) return

    // Get the available issues for this page
    let wiki_api = new WikiApi()
    let issue_nums = getAvailableIssueIds()
    
    // If there are issues available, inject a dropdown list to integrate them
    if (issue_nums.length > 0) {
        let dropdown = document.createElement("select")
        dropdown.setAttribute("id", "issue_dropdown")
        
        // Default, unselected option
        let option = document.createElement("option")
        option.setAttribute("disabled", "true")
        option.setAttribute("selected", "true")
        option.innerHTML = ""
        dropdown.appendChild(option)

        // Attach issue ids as options
        issue_nums.forEach(issue_num => {
            let option = document.createElement("option")
            option.setAttribute("value", issue_num)
            option.innerHTML = issue_num
            dropdown.appendChild(option)
        })
        dropdown.onchange = loadDiffEditor // When an issue is selected, load the diff view
        
        let label = document.createElement("label")
        label.setAttribute("for", "issue_dropdown")
        label.innerHTML = "Integreer issue-pagina:"

        let div = document.createElement("div")
        div.appendChild(label)
        div.appendChild(dropdown)

        let heading = document.getElementById("firstHeading")
        heading.insertAdjacentElement("afterend", div)
    }

    /**
     * Find all issues we can integrate here by searching for issue pages
     * with the same title.
     * @returns an array with all the issue ids that are available for
     *          integrating.
     */
    function getAvailableIssueIds() {
        let issue_nums = []
        
        // First, get the id for the MedMij namespace
        let ns_query = wiki_api.query({"meta": "siteinfo", "siprop": "namespaces"})
        let namespace_id = -1
        if (ns_query != null) {
            for (let ns_id in ns_query.namespaces) {
                if (ns_query.namespaces[ns_id].canonical == "MedMij") {
                    namespace_id = ns_id
                    break
                }
            }
        }

        // Now inspect all pages starting with Vissue in this namespace
        if (namespace_id != -1) {
            let issue_query = wiki_api.query({"list": "prefixsearch", "pssearch": "Vissue", "psnamespace": namespace_id})
            if (issue_query != null) {
                // In the URL, spaces are replaced by underscores, so to get
                // the title, we have, to replace them
                let naked_page_title = url_parts[1].replace(new RegExp("_", "g"), " ")
                for (let key in issue_query.prefixsearch) {
                    // If the end of the title matches the end of _our_ title,
                    // extract the issue number from the title and store it.
                    let issue = issue_query.prefixsearch[key]
                    if (issue.title.endsWith(naked_page_title)) {
                        let title_parts = /MedMij:Vissue-(.*?) /.exec(issue.title)
                        if (title_parts != null && title_parts.length > 1) {
                            issue_nums.push(title_parts[1])
                        } else {
                            console.log("Couldn't extract issue num from '" + issue.title + "'")
                        }
                    }
                }
            }
        } else {
            console.log("Couldn't get the MedMij namespace id")
        }

        return issue_nums
    }

    /**
     * Replace the normal wiki editor with a CodeMirror three-way diff editor,
     * containing the current content, the content of the selected issue on the
     * left, and the content of the original situation on the right.
     */
    function loadDiffEditor() {
        let issue_id   = document.getElementById("issue_dropdown").selectedOptions[0].value
        let orig_info  = null
        let issue_info = wiki_api.getWikiText("page=MedMij:Vissue-" + issue_id + "_" + url_parts[1])
        if (issue_info != null) {
            let last_revision = null
            let issue_revisions = wiki_api.getPageRevisions(issue_info["pageid"])
            if (issue_revisions != null) {
                last_revision = issue_revisions[issue_revisions.length - 1].revid
                orig_info = wiki_api.getWikiText("oldid=" + last_revision)
            }
        }
        if (issue_info != null && orig_info != null) {
            // Hide the normal wiki editor
            let editor   = document.getElementsByClassName("wikiEditor-ui-view-wikitext")[0] // The entire editor component
            let textarea = document.getElementById("wpTextbox1")                             // The textarea of the editor component
            editor.childNodes.forEach(child => child.style.display = "none")

            // Remove the CodeMirror if we selected a previous issue to integrate
            for (let child of document.getElementsByClassName("CodeMirror-merge")) {
                child => child.remove()
            }

            // Instead, insert the CodeMirror MergeView with the three components
            let code_mirror = CodeMirror.MergeView(editor,
                {
                    "value": textarea.textContent,
                    "origLeft": issue_info["wikitext"],
                    "origRight": orig_info["wikitext"],
                    "lineWrapping": true,
                    "lineNumbers": true,
                    "connect": "align",
                    "collapseIdentical": true
                }
            )
            if (document.getElementById("CodeMirror-header") == null) {
                let header = document.createElement("table")
                header.setAttribute("style", "width: 100%; text-align: center;")
                header.setAttribute("id", "CodeMirror-header")
                header.innerHTML = "<tr><td style='width: 33%;'>Issue-tekst</td><td style='width: 33%;'>Vprepub</td><td style='width: 33%;'>Origineel</td></tr>"
                editor.insertAdjacentElement("afterbegin", header)
            }

            // Mirror all changes in the CodeMirror editor to the hidden wiki 
            // editor, where it can be picked up by the other functionality
            // of the edit page. Rather crude, but it will do for now.
            code_mirror.editor().on("change", function() {
                textarea.textContent = code_mirror.editor().getValue()
            })
        }
    }
})()