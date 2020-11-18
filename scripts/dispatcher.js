/**
 * A "central dispatcher" for everything that can be done on the Informatiestandaarden wiki, based on the URL:
 * - Add a "create issue" button.
 * - Populate the text of an issue page.
 * - Add the tools to merge an issue page to a staging environment (from issue_integrator.js)
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

(function() {
    let url_analyzer = new URLAnalyzer()
    if (url_analyzer.type == "read") {
        if (url_analyzer.realm == "production") {
            insertNewIssueLink(url_analyzer)
        }
    } else if (url_analyzer.type == "create") {
        populateIssue(url_analyzer)
    } else if (url_analyzer.type == "edit" && url_analyzer.realm == "staging") {
        let integrator = new IssueIntegrator(url_analyzer)
        integrator.integrate()
    }
})()