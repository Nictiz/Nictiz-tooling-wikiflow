/** 
 * Interact with the wiki API.
 *  
 * WARNING: Contains magic variables for the  Informatiestandaarden wiki.
 */
function WikiApi() {
    this.base_url = "https://informatiestandaarden.nictiz.nl/api.php"

    /** 
     * Query the wikitext content for a given page.
     * @param query_key a query key as understood by the "parse" action to
     *                   select the specified page
     * @returns an object with the raw wikitext ("wikitext"), the page id 
     *          ("pageid") and the id of the used revision ("revid"). On 
     *          failure, null is returned.
     */
    this.getWikiText = function(query_key) {
        // Start a synchronous request, interpreting the result as JSON
        let url = this.base_url + "?action=parse&prop=wikitext|revid&format=json&" + query_key
        let http_request = new XMLHttpRequest()
        http_request.open("GET", url, false)
        http_request.responseType = "json"
        http_request.send()
        if (http_request.readyState === XMLHttpRequest.DONE) {
            try {
                let wikitext = http_request.response.parse.wikitext["*"]
                let pageid   = http_request.response.parse.pageid
                let revid    = http_request.response.parse.revid
                if (wikitext != null && pageid != null && revid != null) {
                    return {"wikitext": wikitext, "pageid": pageid, "revid": revid}
                }
            } catch (error) {
                // Silently ignore to return null
            }
        }
        return null
    }
}
