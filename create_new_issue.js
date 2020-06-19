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
    let url_parts = /.*\/wiki\/MedMij:V2019.01(.*)/.exec(window.location.href)
    if (url_parts == null) return

    // Insert a link to create a new issue
    let new_issue_link = document.createElement("li")
    new_issue_link.innerHTML = "<span><a>Nieuw issue</a></span>"
    new_issue_link.onclick = function() {
        let issue_num = prompt("Issuenummer:", "MM-")
        if (issue_num != null) {
            window.location.href = "/index.php?title=MedMij:Vissue-" + issue_num + url_parts[1] + "&action=edit"
        }
    }
    document.getElementById("ca-edit").insertAdjacentElement("afterend", new_issue_link)
})()