/**
 * Script to automatically populate the text + description of a new issue page 
 * with the contents of the corresponding Vcurrent page, with the necessary
 * rewrites.
 */
(async function() {
    // Guard variable
    if (window.has_run) {
        return
    }
    window.has_run = true

    // Parse the URL and check if this is a newly created issue page
    let url_parts = /.*index.php\?title=MedMij:Vissue-(.*?)([_\/].*?)(&.*)?&action=edit(&.+)?/.exec(window.location.href)
    if (url_parts != null) {
        let heading = document.getElementById("firstHeading")
        if (!(heading && (heading.textContent.startsWith("Bezig met het aanmaken van") || heading.textContent.startsWith("Creating")))) return
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

    // Figure out which page to branch off using the "source" parameter
    let Vcurrent = "V2020.01"
    let search_params = new URL(window.location.href).searchParams
    if (search_params.has("source")) {
        Vcurrent = search_params.get("source")
    }

    // Ok, lets go ahead
    let wiki_api = new WikiApi()
    let production_info = await wiki_api.getWikiText("page=MedMij:" + Vcurrent + url_parts[2])
    if (production_info != null) {
        document.getElementById("wpTextbox1").textContent = modifyText(production_info["wikitext"])
        document.getElementById("wpSummary").setAttribute("value", "Clone of " + Vcurrent + " production page for issue " + url_parts[1])

        // Submit, so people aren't tempted to start editing right away
        document.getElementById("editform").submit()
    } else {
        console.log("Couldn't fetch wikitext from production page")
    }

    function modifyText(orig) {
        // Rewrite links and transclusions
        let rewriter = new PrefixRewriter("MedMij:" + Vcurrent, "MedMij:Vprepub")
        let modified = rewriter.rewrite(orig)
        console.log(modified)
        
        // Inject __NOINDEX__
        modified = "__NOINDEX__\n" + modified

        // Modify the issuebox to link to the issue in BITS
        modified = modified.replace(/{{MedMij:Vprepub(_|\/)Issuebox}}/, "{{MedMij:Vissue$1Issuebox|" + url_parts[1] + "}}") // FO
        modified = modified.replace(/{{MedMij:Vprepub(_|\/)Issuebox_FHIR_IG}}/, "{{MedMij:Vissue$1Issuebox_FHIR_IG|" + url_parts[1] + "}}") // TO

        return modified
    }
})()