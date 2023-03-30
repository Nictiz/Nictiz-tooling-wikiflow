/**
 * A "central dispatcher" for everything that can be done on the Informatiestandaarden wiki, based on the URL:
 * - Add a "create issue" button.
 * - Populate the text of an issue page.
 * - Add the tools to merge an issue page to a prepub environment (from issue_integrator.js)
 */

/**
 * On production pages, insert a button to create a new issue.
 * @param {URLAnalyzer} url_analyzer - The URLAnalyzer object for this page
 */
function insertNewIssueLink(url_analyzer) {
    // Create (hidden) dialog in HTML
    document.body.insertAdjacentHTML("beforeend", "<dialog id='new_issue_dialog'> \
        <form method='dialog'> \
        <label for='issue_num'>" + browser.i18n.getMessage("NewIssueID") + ": </label> \
        <input type='text' id='issue_id' placeholder='MM-' size='10'/><br />\
        <input type='checkbox' id='no_bits_checkbox'/> \
        <label for='bits_checkbox'>" + browser.i18n.getMessage("NotOnBITS") + "</label>\
        <span id='issue_url_div' style='display: none'> \
            <label for='issue_url' id='issue_url_label'>" + browser.i18n.getMessage("butOnURL") + ": </label> \
            <input type='url' id='issue_url' size='40'/>\
        </span> \
        <br /><input type='checkbox' id='create_blank_checkbox'/> \
        <label for='create_blank_checkbox'>" + browser.i18n.getMessage("CreateEmptyPage") + "</label>\
        <span id='blank_page_div' style='display: none'> \
            <label for='blank_page_title' size='40'>" + browser.i18n.getMessage("withTitle") + ": </label> \
            <input type='text' id='blank_page_title'>\
        </span> \
        <br /><button id='new_issue_ok'>Ok</button> \
    </form> \
</dialog>")
    // Add event listeners to the dialog
    document.getElementById('no_bits_checkbox').addEventListener('change', event => {
        let issue_url_div = document.getElementById('issue_url_div')
        if (event.target.checked) {
            issue_url_div.style.display = 'inline'
        } else {
            issue_url_div.style.display = 'none'
        }
    })
    document.getElementById('create_blank_checkbox').addEventListener('change', event => {
        let title_input_div = document.getElementById('blank_page_div')
        if (event.target.checked) {
            title_input_div.style.display = 'inline'
        } else {
            title_input_div.style.display = 'none'
        }
    })

    document.getElementById('new_issue_ok').onclick = function() {
        let issue_id = document.getElementById('issue_id').value
        let create_blank = document.getElementById('create_blank_checkbox').checked
        let title
        if (create_blank) {
            title = document.getElementById('blank_page_title').value
            // Sanity checking is left to MediaWiki itself
        } else {
            title = url_analyzer.title
        }
        if (issue_id.match(/^[A-Za-z0-9\-\.]+$/)) {
            let href = "/index.php?title="
            href += url_analyzer.namespace + "Vissue-" + issue_id
            href += url_analyzer.separator + title
            href += "&action=edit&source=" + url_analyzer.version
            if (create_blank) {
                href += "&clone=false"
            }
            if (document.getElementById('no_bits_checkbox').checked) {
                let issue_url = document.getElementById('issue_url').value
                try {
                    new URL(issue_url)
                } catch {
                    console.log("Unable to parse issue URL")
                    return
                }
                href += '&issue_url=' + encodeURI(issue_url)
            }
            console.log(href)
            window.location.href = href
        } else {
            alert(browser.i18n.getMessage("InvalidIssueNumber"))
        }
    }

    let new_issue_link = document.createElement("li")
    new_issue_link.innerHTML = "<span><a>" + browser.i18n.getMessage("NewIssue") + "</a></span>"
    new_issue_link.onclick = () => document.getElementById('new_issue_dialog').showModal()

    document.getElementById("ca-history").insertAdjacentElement("beforebegin", new_issue_link)
}

/**
 * On new issue pages with the "source" parameter set, freeze all input, populate the text and save the page.
 * The "source" parameter specifies the version of the page to clone from.
 * 
 * @param {URLAnalyzer} url_analyzer - The URLAnalyzer object for this page
 */
function populateIssue(url_analyzer) {
    if (url_analyzer.type != "create") return

    // Figure out which page to branch off using the "source" parameter
    let source_naked = null
    let source       = null
    if (url_analyzer.search_params.has("source")) {
        source_naked = url_analyzer.search_params.get("source")
        source       = "V" + source_naked
    } else {
        return
    }

    // Figure out if we should clone an existing page
    let clone = true
    if (url_analyzer.search_params.has("clone") && url_analyzer.search_params.get("clone") == "false") {
        clone = false
    }

    // Make the page inaccessible while its populated and saved
    let grayout = document.createElement("div")
    grayout.style.position = "fixed"
    grayout.style.left = "0px"
    grayout.style.right = "0px"
    grayout.style.width = "100%"
    grayout.style.height = "100%"
    grayout.style.backgroundColor = "black"
    grayout.style.opacity = "0.75"
    grayout.style.zIndex = "99999"
    let wait = document.createElement("p")
    wait.innerHTML = browser.i18n.getMessage("PleaseWait")
    wait.style.fontSize = "500%"
    wait.style.width = "100%"
    wait.style.textAlign = "center"
    wait.style.color = "white"
    grayout.appendChild(wait)
    document.getElementsByTagName("html")[0].insertAdjacentElement("afterbegin", grayout)

    // Ok, lets go ahead
    let fetcher
    if (!clone) {
        // If we're not cloning a page, create a mock promise to return an empty text that we can 'rewrite'
        fetcher = new Promise((resolve) => resolve(""))
    } else {
        // Otherwise, fetch the original text
        let wiki_api = new WikiApi()
        let production_query = {page: url_analyzer.namespace + source + url_analyzer.separator + url_analyzer.title}
        fetcher = wiki_api.getWikiText(production_query)
            .then(production_info => production_info["wikitext"])
    }
    
    fetcher.then(original => {
        // Rewrite links and transclusions
        let rewriter = new PrefixRewriter(url_analyzer.namespace + source + url_analyzer.separator, url_analyzer.namespace + "Vprepub-" + source_naked + url_analyzer.separator)
        modified = rewriter.rewrite(original)

        // Make sure issue pages aren't indexed
        if (!modified.match("__NOINDEX__")) {
            modified = "__NOINDEX__\n" + modified
        }

        // Notify the user that this is a temporary issue page
        let issue_box = `{{IssuePaginaWaarschuwing|${url_analyzer.issue_id}|`;
        issue_box += url_analyzer.namespace + source + url_analyzer.separator + url_analyzer.title
        if (url_analyzer.lang != null) {
            issue_box += "|lang=" + url_analyzer.lang
        }
        if (url_analyzer.search_params.has('issue_url')) {
            issue_box += "|url=" + decodeURI(url_analyzer.search_params.get('issue_url'))
        }
        issue_box += "}}\n"
        modified = issue_box + modified

        document.getElementById("wpTextbox1").textContent = modified
        
        // Create a summary for this edit
        let summary
        if (clone) {
            summary = "Clone of " + source + " production page for issue " + url_analyzer.issue_id
        } else {
            summary = "New page for issue " + url_analyzer.issue_id
        }
        document.getElementById("wpSummary").setAttribute("value", summary)

        // Submit, so people aren't tempted to start editing right away
        document.getElementById("editform").submit()
    }).catch(error => {
        console.log("Couldn't fetch wikitext from production page:", error)
    })


}

/**
 * On issue pages, add a button to integrate the issue into the prepub page(s). When clicked, this will become a
 * dropdown to select the prepub to integrate with.
 */
function insertIntegrateIssueLink(url_analyzer) {
    let wiki_api = new WikiApi()

    wiki_api.query({
        "list": "prefixsearch",
        "pssearch": url_analyzer.namespace + "Vprepub-",
        "pslimit": 500
    }).then(query => {
        // Create a dropdown list to choose the prepub version we want to integrate with
        let dropdown = document.createElement("select")
        
        let versions = {} // Collect all prepub versions in this namespace and check for each version if the 
                          // corresponding prepub page already exists (true of false)
        for (const key in query.prefixsearch) {
            let page_title = query.prefixsearch[key].title
            let title_analyzer = new TitleAnalyzer(page_title)
            if (title_analyzer.version) {
                if (title_analyzer.title == url_analyzer.title && title_analyzer.separator == url_analyzer.separator) {
                    versions[title_analyzer.version] = true
                } else if (!(title_analyzer.version in versions)) {
                    versions[title_analyzer.version] = false
                }
            } else {
                console.log(`Couldn't extract version number from ${page_title}.`)
            }
        }

        // Add first all versions that have a corresponding prepub page and then all versions that don't to the
        // dropdown.
        let versions_existing = []
        let versions_new      = []
        Object.keys(versions).forEach(version => {
            if (versions[version]) {
                versions_existing.push(version)
             } else {
                versions_new.push(version)
             }
        })
        versions_existing.sort()
        versions_existing.forEach(version => {
            let option = document.createElement("option")
            option.setAttribute("value", version)
            option.innerHTML = version
            dropdown.appendChild(option)
        })
        versions_new.sort()
        versions_new.forEach(version => {
            let option = document.createElement("option")
            option.setAttribute("value", version)
            option.innerHTML = version + " (" + browser.i18n.getMessage("PageDoesntExistYet") + ")"
            dropdown.appendChild(option)
        })

        if (dropdown.childNodes.length > 0) {
            // So we have some content. Let's also add the default, empty element
            let empty = document.createElement("option")
            empty.setAttribute("selected", "selected")
            empty.innerHTML = browser.i18n.getMessage("SelectPrepubVersion")
            dropdown.insertAdjacentElement("afterbegin", empty)

            // When a value is selected. the URL is changed to the edit URL of that prepub page, with the merge_issue
            // parameter set to this issue
            dropdown.addEventListener("change", event => {
                let version = dropdown.selectedOptions[0].value
                window.location.href = `/index.php?title=${url_analyzer.namespace}Vprepub-${version}${url_analyzer.separator}${url_analyzer.title}&action=edit&merge_issue=${url_analyzer.issue_id}`
            })

            // Add a "merge issue" link, which will be replaced by the dropdown when clicked
            let merge_issue_link = document.createElement("li")
            merge_issue_link.innerHTML = "<span><a>" + browser.i18n.getMessage("IntegrateChanges") + "</a></span>"
            merge_issue_link.onclick = function() {
                merge_issue_link.innerHTML = ""
                merge_issue_link.appendChild(dropdown)
            }
            document.getElementById("ca-edit").insertAdjacentElement("afterend", merge_issue_link)
        }
    })
}

/**
 * If text is from a transcluded page, Mediawiki will automatically and silently redirect the edit links to this page.
 * This has many issues when editing in issue and prepub environments, eg:
 * - Transclusions for issue pages default to prepub, but you don't want to edit prepub pages.
 * - Transclusions could be redirected to issue pages, but the issue page might not exist yet.
 * - What to do with transclusions from other environments.
 * 
 * So instead, all edit links that would redirect to a transcluded page are disabled and replaced by a warning.
 */
function rewriteTranscludedLinks(url_analyzer) {
    // Construct the title for _this_ page
    let target_title = ""
    if (url_analyzer.realm == "issue") {
        target_title = url_analyzer.namespace + "Vissue-" + url_analyzer.issue_id + url_analyzer.separator + url_analyzer.title
    } else if (url_analyzer.realm == "prepub") {
        target_title = url_analyzer.namespace + "Vprepub-" + url_analyzer.version + url_analyzer.separator + url_analyzer.title
    } else {
        return
    }

    // Rewrite all edit links where the target title is different
    document.querySelectorAll("span.mw-editsection a").forEach(link => {
        if (link.href) {
            let params = new URL(link.href).searchParams
            if (params.has("title") && params.get("title") != target_title) {
                let replacement = document.createElement("span")
                replacement.setAttribute("class", "edit-transclusion")
                replacement.setAttribute("title", "This text is on a transcluded page. You need to create and edit the issue page for this transcluded page.")
                replacement.textContent = "editing disabled"
                link.parentElement.replaceChild(replacement, link)
            }
        }
    })
}

(function() {
    let url_analyzer = new URLAnalyzer()
    if (url_analyzer.type == "read") {
        if (url_analyzer.realm == "production") {
            insertNewIssueLink(url_analyzer)
        } else if (url_analyzer.realm == "issue") {
            insertIntegrateIssueLink(url_analyzer)
            rewriteTranscludedLinks(url_analyzer)
        } else if (url_analyzer.realm == "prepub") {
            rewriteTranscludedLinks(url_analyzer)
        }
    } else if (url_analyzer.type == "create" && url_analyzer.realm == "issue") {
        populateIssue(url_analyzer)
    } else if ((url_analyzer.type == "edit" || url_analyzer.type == "create") && url_analyzer.realm == "prepub") {
        let integrator = new IssueIntegrator(url_analyzer)
        integrator.integrate()
    }
})()