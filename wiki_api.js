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

    /**
     * Get all the page revisions
     * @param page_id the id for the page we're interested in
     * @returns An object with the revisions. The keys are numbers from 0 on,
     *          the values are objects containing the keys "revid", "parentid",
     *          "user", "timestamp" and "comment". On error, null is returned
     */
    this.getPageRevisions = function(page_id) {
        // Start the synchronous request, interpreting the result as JSON
        let http_request = new XMLHttpRequest()
        let url = this.base_url + "?action=query&prop=revisions&format=json&rvlimit=500&pageids=" + page_id
        http_request.open("GET", url, false)
        http_request.responseType = "json"
        http_request.send()
        if (http_request.readyState === XMLHttpRequest.DONE) {
            try {
                return http_request.response.query.pages[page_id].revisions
            } catch (error) {
                // Silently ignore to return null
            }
        }

        return null
    }


    /**
     * Generic function to call the query action
     * @param parameters a associative array with the parameters to query on
     * @returns the response in JSON format
     */
    this.query = function(parameters) {
        let url = this.base_url + "?action=query&format=json"
        for (let key in parameters) {
            url += "&" + encodeURI(key) + "=" + encodeURI(parameters[key])
        }
        let http_request = new XMLHttpRequest()
        http_request.open("GET", url, false)
        http_request.responseType = "json"
        http_request.send()
        if (http_request.readyState === XMLHttpRequest.DONE) {
            try {
                return http_request.response.query
            } catch (error) {
                // Silently ignore to return null
            }
        }
        return null
    }
}
