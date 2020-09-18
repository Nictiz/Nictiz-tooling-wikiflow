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

    // Parse the URL and check if this is a newly created issue page
    let url_parts = /.*index.php\?title=MedMij:Vissue-(.*?)([_\/].*?)(&.*)?&action=edit(&.+)?/.exec(window.location.href)
    if (url_parts != null) {
        let heading = document.getElementById("firstHeading")
        if (!(heading && (heading.textContent.startsWith("Bezig met het aanmaken van") || heading.textContent.startsWith("Creating")))) return
    }

    // Figure out which page to branch off using the "source" parameter
    let Vcurrent = "V2020.01"
    let search_params = new URL(window.location.href).searchParams
    if (search_params.has("source")) {
        Vcurrent = search_params.get("source")
    }

    // Ok, lets go ahead
    let wiki_api = new WikiApi()
    wiki_api.getWikiText("page=MedMij:" + Vcurrent + url_parts[2], production_info => {
        if (production_info != null) {
            document.getElementById("wpTextbox1").textContent = modifyText(production_info["wikitext"])
            document.getElementById("wpSummary").setAttribute("value", "Clone of production page for issue " + url_parts[1])

            // Submit, so people aren't tempted to start editing right away
            document.getElementById("editform").submit()
        } else {
            console.log("Couldn't fetch wikitext from production page")
        }
    })

    function modifyText(orig) {
        // We modify links to "Vprepub", because that's what we probably want to link to
        let modified = orig.replace(new RegExp(Vcurrent, "g"), "Vprepub")
        
        // Inject __NOINDEX__
        modified = "__NOINDEX__\n" + modified

        // Modify the issuebox to link to the issue in BITS
        modified = modified.replace(/{{MedMij:Vprepub(_|\/)Issuebox}}/, "{{MedMij:Vissue$1Issuebox|" + url_parts[1] + "}}") // FO
        modified = modified.replace(/{{MedMij:Vprepub(_|\/)Issuebox_FHIR_IG}}/, "{{MedMij:Vissue$1Issuebox_FHIR_IG|" + url_parts[1] + "}}") // TO

        return modified
    }
})()