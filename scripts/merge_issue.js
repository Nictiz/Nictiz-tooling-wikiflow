/**
 * On issue pages, add a link to merge the issue to the current Vprepub/V2019.01 page.
 */
(function() {
    // Guard variable
    if (window.has_run) {
        return
    }
    window.has_run = true

    // Parse the URL
    let url_parts = /\/wiki\/MedMij:Vissue-(.*?)([_\/])(.*)/.exec(new URL(window.location.href).pathname)
    if (url_parts == null) return

    // Insert a link to merge this issue
    let merge_issue_link = document.createElement("li")
    merge_issue_link.innerHTML = "<span><a>Integreer aanpassingen</a></span>"
    merge_issue_link.onclick = function() {
        if (url_parts[2] == "/") { // V2020.01
            window.location.href = "/index.php?title=MedMij:Vprepub/" + url_parts[3] + "&action=edit&merge_issue=" + url_parts[1]
        } else if (url_parts[2] == "_") { // V2019.01
            window.location.href = "/index.php?title=MedMij:V2019.01_" + url_parts[3] + "&action=edit&merge_issue=" + url_parts[1]
        }
    }
    document.getElementById("ca-edit").insertAdjacentElement("afterend", merge_issue_link)
})()