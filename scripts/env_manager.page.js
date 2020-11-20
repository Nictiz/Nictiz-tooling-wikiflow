/** 
 * One of the three js files needed to perform the pages switching operation.
 * This is basically a dispatcher to the WikiApi, but it has to run in the 
 * context of the webpage in order to avoid CORS problems.
 * The other two files are the background script and the page UI script.
 */
wiki_api = null
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (wiki_api === null) {
        wiki_api = new WikiApi()
    }
    if (message.type == "wikiQuery") {
        return wiki_api.query(message.payload)
    } else if (message.type == "wikiDeletePage") {
        return wiki_api.deletePage(message.page_id)
    } else if (message.type == "wikiGetText") {
        return wiki_api.getWikiText(message.query_key)
    } else if (message.type == "wikiChangeText") {
        return wiki_api.changePageText(message.page_id, message.new_text, message.summary, message.is_minor)
    } else if (message.type == "wikiDuplicatePage") {
        return wiki_api.duplicatePage(message.title, message.new_title)
    }
})
  