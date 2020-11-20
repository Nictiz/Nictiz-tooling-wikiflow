/**
 * Background script for the extension. It currently servers a single function:
 * to open a new tab with the UI to switch environments when the address bar
 * button is pressed.
 */

// Save the id of the script tab where we were when the button was clicked.
// This tab runs the content script and the id is needed to communicate with
// it. 
 var script_tab_id = null

// Listen to clicks on the address bar button
browser.pageAction.onClicked.addListener((tab) => {
    script_tab_id = tab.id
    let create_data = {
        url: "webpages/env_manager.html",
        openerTabId: tab.id
    }
    browser.tabs.create(create_data)
})
