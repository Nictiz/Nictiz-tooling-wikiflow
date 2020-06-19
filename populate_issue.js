/**
 * Script to automatically populate the text + description of a new issue page 
 * with the contents of the corresponding Vcurrent page, with the necessary
 * rewrites.
 */
(function() {
    // Guard variable
    if (window.has_run) {
        return
    }
    window.has_run = true

    let Vcurrent = "V2019.01"

    // Parse the URL and check if this is a newly created issue page
    let url_parts = /.*index.php\?title=MedMij:Vissue-(.*?)(_.*?)(&.*)?&action=edit/.exec(window.location.href)
    if (url_parts != null) {
        let heading = document.getElementById("firstHeading")
        if (!(heading && heading.textContent.startsWith("Bezig met het aanmaken van"))) return
    }

    // Ok, lets go ahead
    let orig = fetchWikitextFromProduction()
    if (orig != null) {
        let issue_text = modifyText(orig)
        document.getElementById("wpTextbox1").textContent = issue_text
        document.getElementById("wpSummary").setAttribute("value", "Clone of production page for issue " + url_parts[1])
    }

    function fetchWikitextFromProduction() {
        let wiki_api = new WikiApi()
        let production_info = wiki_api.getWikiText("page=MedMij:" + Vcurrent + url_parts[2])
        if (production_info != null) {
            return production_info["wikitext"]
        } else {
            console.log("Couldn't fetch wikitext from production page")
        }
        return null
    }

    function modifyText(orig) {
        // We modify links to "Vprepub", because that's what we probably want to link to
        let modified = orig.replace(new RegExp(Vcurrent, "g"), "Vprepub")
        
        // Inject __NOINDEX__
        modified = "__NOINDEX__\n" + modified

        // Modify the issuebox to link to the issue in BITS
        modified = modified.replace("{{MedMij:Vprepub_Issuebox}}", "{{MedMij:Vissue_Issuebox|" + url_parts[1] + "}}") // FO
        modified = modified.replace("{{MedMij:Vprepub_Issuebox_FHIR_IG}}", "{{MedMij:Vissue_Issuebox_FHIR_IG|" + url_parts[1] + "}}") // TO

        return modified
    }
})()