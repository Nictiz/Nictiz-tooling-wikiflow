/** 
 * One of the three js files needed to perform the pages switching operation.
 * This is basically a dispatcher to the WikiApi, but it has to run in the 
 * context of the webpage in order to avoid CORS problems.
 * The other two files are the background script and the page UI script.
 */
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    let wiki_api = new WikiApi()

    if (message.type == "wikiQuery") {
        return wiki_api.query(message.payload)
    } else if (message.type == "wikiDeletePage") {
        return wiki_api.deletePage(message.page_id, message.token)
    } else if (message.type == "wikiMovePage") {
        return wiki_api.movePage(message.page_id, message.new_title, message.token)
    }
})
  