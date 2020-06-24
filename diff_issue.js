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
    let orig_info  = null
    let issue_info = null

    // Because we're using (required) asynchronous API calls, the rest of the
    // process is a web of callbacks. Let's kickstart the process bu getting
    // the MedMij namespace
    let namespace_id = -1
    wiki_api.query({"meta": "siteinfo", "siprop": "namespaces"}, ns_info => {
        let namespace_id = -1
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
            extractIssueIdsFromSiteInfo
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
    function loadDiffEditor(orig) {
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
                    "value": orig,
                    "origLeft": issue_info["wikitext"],
                    "origRight": textarea.textContent,
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
                header.innerHTML = "<tr><td style='width: 33%;'>Issue-tekst</td><td style='width: 33%;'>Origineel</td><td style='width: 33%;'>Huidige Vprepub</td></tr>"
                editor.insertAdjacentElement("afterbegin", header)
            } else {
                document.getElementById("CodeMirror-header").style.display = "table"
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