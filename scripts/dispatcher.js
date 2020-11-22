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
    let new_issue_link = document.createElement("li")
    new_issue_link.innerHTML = "<span><a>Nieuw issue</a></span>"
    new_issue_link.onclick = function() {
        let issue_num = prompt("Issuenummer:", "MM-")
        if (issue_num != null) {
            if (issue_num.match(/^[A-Za-z0-9\-\.]+$/)) {
                let href = "/index.php?title="
                href += url_analyzer.namespace + "Vissue-" + issue_num
                href += url_analyzer.separator + url_analyzer.title
                href += "&action=edit&source=" + url_analyzer.version
                window.location.href = href
            } else {
                alert("Ongeldig issuenummer!")
            }
        }
    }
    document.getElementById("ca-edit").insertAdjacentElement("afterend", new_issue_link)
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
    let source = null
    if (url_analyzer.search_params.has("source")) {
        source = "V" + url_analyzer.search_params.get("source")
    } else {
        return
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
    wait.innerHTML = "Please wait ..."
    wait.style.fontSize = "500%"
    wait.style.width = "100%"
    wait.style.textAlign = "center"
    wait.style.color = "white"
    grayout.appendChild(wait)
    document.getElementsByTagName("html")[0].insertAdjacentElement("afterbegin", grayout)

    // Ok, lets go ahead
    let wiki_api = new WikiApi()
    let production_query = {page: url_analyzer.namespace + source + url_analyzer.separator + url_analyzer.title}
    wiki_api.getWikiText(production_query).then(production_info => {
        // Rewrite links and transclusions
        let rewriter = new PrefixRewriter(url_analyzer.namespace + source, url_analyzer.namespace + "Vprepub")
        let modified = rewriter.rewrite(production_info["wikitext"])
        
        // Inject __NOINDEX__
        modified = "__NOINDEX__\n" + modified

        // Modify the issuebox to link to the issue in BITS
        modified = modified.replace(/{{" + url_analyzer.namespace + "Vprepub(_|\/)Issuebox}}/, "{{" + url_analyzer.namespace + "Vissue$1Issuebox|" + url_analyzer.issue_id + "}}") // FO
        modified = modified.replace(/{{" + url_analyzer.namespace + "Vprepub(_|\/)Issuebox_FHIR_IG}}/, "{{" + url_analyzer.namespace + "Vissue$1Issuebox_FHIR_IG|" + url_analyzer.issue_id + "}}") // TO

        document.getElementById("wpTextbox1").textContent = modified
        document.getElementById("wpSummary").setAttribute("value", "Clone of " + source + " production page for issue " + url_analyzer.issue_id)

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
    wiki_api.query({"list": "prefixsearch", "pssearch": url_analyzer.namespace + "Vprepub-", "pslimit": 500}).then(query => {

        // Create a dropdown list to choose the prepub version we want to integrate with
        let dropdown = document.createElement("select")
        
        let versions = {} // Collect all prepub versions in this namespace and check for each version if the 
                          // corresponding prepub page already exists (true of false)
        for (const key in query.prefixsearch) {
            let page_title = query.prefixsearch[key].title
            let title_analyzer = new TitleAnalyzer(page_title)
            if (title_analyzer.version) {
                if (title_analyzer.title == url_analyzer.title) {
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
            option.innerHTML = version + " (pagina bestaat nog niet)"
            dropdown.appendChild(option)
        })

        if (dropdown.childNodes.length > 0) {
            // So we have some content. Let's also add the default, empty element
            let empty = document.createElement("option")
            empty.setAttribute("selected", "selected")
            empty.innerHTML = "Selecteer prepub-versie"
            dropdown.insertAdjacentElement("afterbegin", empty)

            // When a value is selected. the URL is changed to the edit URL of that prepub page, with the merge_issue
            // parameter set to this issue
            dropdown.addEventListener("change", event => {
                let version = dropdown.selectedOptions[0].value
                window.location.href = `/index.php?title=${url_analyzer.namespace}Vprepub-${version}${url_analyzer.separator}${url_analyzer.title}&action=edit&merge_issue=${url_analyzer.issue_id}`
            })

            // Add a "merge issue" link, which will be replaced by the dropdown when clicked
            let merge_issue_link = document.createElement("li")
            merge_issue_link.innerHTML = "<span><a>Integreer aanpassingen</a></span>"
            merge_issue_link.onclick = function() {
                merge_issue_link.innerHTML = ""
                merge_issue_link.appendChild(dropdown)
            }
            document.getElementById("ca-edit").insertAdjacentElement("afterend", merge_issue_link)
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
        }
    } else if (url_analyzer.type == "create" && url_analyzer.realm == "issue") {
        populateIssue(url_analyzer)
    } else if ((url_analyzer.type == "edit" || url_analyzer.type == "create") && url_analyzer.realm == "prepub") {
        let integrator = new IssueIntegrator(url_analyzer)
        integrator.integrate()
    }
})()