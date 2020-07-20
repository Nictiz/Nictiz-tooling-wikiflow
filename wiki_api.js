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
     * @param callback a callback function that should accept the result as a
     *        javascript object, with the following keys:
     *        * "wikitext": the raw wikitext
     *        * "pageid": the page id
     *        * "revid": the id of the used revision
     *        On failure, null is returend
     */
    this.getWikiText = function(query_key, callback) {
        // Start a synchronous request, interpreting the result as JSON
        let url = this.base_url + "?action=parse&prop=wikitext|revid&format=json&" + query_key
        let http_request = new XMLHttpRequest()
        http_request.open("GET", url)
        http_request.responseType = "json"
        http_request.onload = function() {
            try {
                let wikitext = http_request.response.parse.wikitext["*"]
                let pageid   = http_request.response.parse.pageid
                let revid    = http_request.response.parse.revid
                if (wikitext != null && pageid != null && revid != null) {
                    callback({"wikitext": wikitext, "pageid": pageid, "revid": revid})
                }
            } catch (error) {
                console.log(error)
                callback(null)
            }
        }
        http_request.onerror = function() {
            callback(null)
        }
        http_request.send()
    }

    /**
     * Get all the page revisions
     * @param page_id the id for the page we're interested in
     * @param callback a callback function that should accept the result as a
     *        javascript object with the revisions. The keys are numbers from 0
     *        on, the values are objects containing the keys "revid",
     *        "parentid", "user", "timestamp" and "comment".
     *        On error, null is returned
     */
    this.getPageRevisions = function(page_id, callback) {
        // Start the synchronous request, interpreting the result as JSON
        let http_request = new XMLHttpRequest()
        let url = this.base_url + "?action=query&prop=revisions&format=json&rvlimit=500&pageids=" + page_id
        http_request.open("GET", url)
        http_request.responseType = "json"
        http_request.onload = function() {
            if (http_request.readyState === XMLHttpRequest.DONE) {
                try {
                    callback(http_request.response.query.pages[page_id].revisions)
                } catch (error) {
                    callback(null)
                }
            }
        }
        http_request.onerror = function() {
            callback(null)
        }

        http_request.send()
    }


    /**
     * Generic function to call the query action
     * @param parameters a associative array with the parameters to query on
     * @param callback a callback function that should accept the result as a
     *        javascript object containing the "query" part of the response.
     *        On error, null is returned
     */
    this.query = function(parameters, callback) {
        let url = this.base_url + "?action=query&format=json"
        for (let key in parameters) {
            url += "&" + encodeURI(key) + "=" + encodeURI(parameters[key])
        }
        let http_request = new XMLHttpRequest()
        http_request.open("GET", url)
        http_request.responseType = "json"
        http_request.onload = function() {
            if (http_request.readyState === XMLHttpRequest.DONE) {
                try {
                    callback(http_request.response.query)
                } catch (error) {
                    callback(null)
                }
            }
        }
        http_request.onerror = function() {
            callback(null)
        }
        http_request.send()
    }
}
