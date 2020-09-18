/**
 * On production pages, add a link to create a new issue page for the current
 * page.
 */
(function() {
    // Guard variable
    if (window.has_run) {
        return
    }
    window.has_run = true

    // Parse the URL and check if this is a newly created issue page
    let url_parts = /\/wiki\/MedMij:V20(19|20)\.01(.*)/.exec(new URL(window.location.href).pathname)
    if (url_parts == null) return

    // Insert a link to create a new issue
    let new_issue_link = document.createElement("li")
    new_issue_link.innerHTML = "<span><a>Nieuw issue</a></span>"
    new_issue_link.onclick = function() {
        let issue_num = prompt("Issuenummer:", "MM-")
        if (issue_num != null) {
            window.location.href = "/index.php?title=MedMij:Vissue-" + issue_num + url_parts[2] + "&action=edit&source=V20" + url_parts[1] + ".01"
        }
    }
    document.getElementById("ca-edit").insertAdjacentElement("afterend", new_issue_link)
})()