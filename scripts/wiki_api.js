/** 
 * Interact with the wiki API.
 *  
 * WARNING: Contains some assumptions about the Informatiestandaarden wiki.
 */
function WikiApi() {
    // Construct the url for the API calls, which is assumed to be "/api.php"
    // directly on the host name
    this.getApiURL = function() {
        let url = new URL(window.location.href)
        url.pathname = "api.php"
        url.search   = ""
        return url.toString()        
    }
    const api_url = this.getApiURL()

    /**
     * Operations that change content require a csrf token. This field is set 
     * using the retrieveToken() method.
     */
    this.token = null

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
    this.getWikiText = async function(query_key) {
        // Start a synchronous request, interpreting the result as JSON
        let url = api_url + "?action=parse&prop=wikitext|revid&format=json&" + query_key
        let response = await fetch(url)
        if (response.ok) {
            try {
                let json = await response.json()
                let wikitext = json.parse.wikitext["*"]
                let pageid   = json.parse.pageid
                let revid    = json.parse.revid
                if (wikitext != null && pageid != null && revid != null) {
                    return {"wikitext": wikitext, "pageid": pageid, "revid": revid}
                }
            } catch (error) {
                console.log(error)
            }
        }
        return null
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
    this.getPageRevisions = async function(page_id) {
        // Start the synchronous request, interpreting the result as JSON
        let url = api_url + "?action=query&prop=revisions&format=json&rvlimit=500&pageids=" + page_id
        let response = await fetch(url)
        if (response.ok) {
            let json = await response.json()
            return json.query.pages[page_id].revisions
        }
        return null
    }

    // Cache the Promise to query the token to make sure there's just a single
    // request.
    this.token_querying = null

    /**
     * Query the csrf token and set it to the "token" variable. This token is 
     * needed for operations that change content on the wiki. A token can only
     * be retrieved by logged in users.
     * 
     * If the "token" variable is already set, it won't be overwritten, so this
     * method can be called safely from methods that want to change content.
     * 
     * @returns true when the token parameter is set or false on failure
     */
    this.retrieveToken = async function() {
        if (this.token_querying !== null) await this.token_querying // Make sure we don't start a new token request if the previous one is running
        if (this.token !== null) return true

        this.token_querying = this.query({"meta": "tokens", "type": "csrf"}).then(tokens => {
            if (tokens != null && "tokens" in tokens && "csrftoken" in tokens["tokens"]) {
                this.token = tokens["tokens"]["csrftoken"]
            }   
        })
        await this.token_querying
        
        return (this.token !== null)
    }

    /**
     * Change the text of a wiki page.
     * 
     * NOTE: No conflict checking is done here, it is assumed that the
     * operation is safe to proceed.
     * @param page_id the id of the page to change
     * @param new_text the new wikitext
     * @param summary the summary for the change
     * @param is_minor boolean to indicate if the change should be marked as
     *                 a minor edit
     * @returns true success, or false when the operation failed.
     */
    this.changePageText = async function(page_id, new_text, summary = "", is_minor = false) {
        if (await this.retrieveToken() == false) return false

        // The edit operation requires a POST call
        let response = await this.post({
            "action":  "edit",
            "format":  "json",
            "text":    new_text,
            "summary": summary,
            "minor":   is_minor,
            "pageid":  page_id,
            "token":   this.token
        })

        if (response.ok) {
            let json = await response.json()
            if ("edit" in json && edit["result"] == "Success") {
                return true
            }
        }
        return false
    }

    /**
     * Delete a page by page id, without leaving a redirect or message behind.
     * @param page_id the id of the page to delete.
     * @returns true on success or false on failure
     */
    this.deletePage = async function(page_id) {
        if (await this.retrieveToken() == false) return false

        // The delete operation requires a POST call
        let response = await this.post({
            "action": "delete",
            "format": "json",
            "pageid": page_id,
            "token": this.token
        })

        if (response.ok) {
            let json = await response.json()
            if ("delete" in json) {
                return true
            }
        }
        return false
    }

    /**
     * Move (rename) a page by id, without leaving a redirect behind
     * @param page_id The id of the page to rename
     * @param new_title The new title of the page
     * @returns on success, an Object containing the "from" and "to" keys, or
     *          false on failure
     */
    this.movePage = async function(page_id, new_title) {
        if (await this.retrieveToken() == false) return false

        // The move operation requires a POST call
        let response = await this.post({
            "action": "move",
            "format": "json",
            "fromid": page_id,
            "to": new_title,
            "noredirect": true,
            "token": this.token
        })

        if (response.ok) {
            let json = await response.json()
            return json["move"]
        }
        return false
    }

    /**
     * Generic function to call the query action
     * @param parameters a associative array with the parameters to query on
     * @param callback a callback function that should accept the result as a
     *        javascript object containing the "query" part of the response.
     *        On error, null is returned
     */
    this.query = async function(parameters) {
        let url = api_url + "?action=query&format=json"
        for (let key in parameters) {
            url += "&" + encodeURI(key) + "=" + encodeURI(parameters[key])
        }
        let response = await fetch(url)
        if (response.ok) {
            let json = await response.json()
            return json.query
        }
        return null
    }

    /**
     * Helper method to perform a POST operation on the wiki API URL, using the
     * parameters as the body.
     * @param params a JSON Object containing the parameters to send
     * @returns a Resonse object as generated by fetch()
     */
    this.post = async function(params) {
        // The wiki API only seems to accept an x-www-form-urlencoded POST 
        // body, so we need to construct the body manually in this form. 
        let encoded_params = ""
        for (const key in params) {
            let encoded_param = encodeURIComponent(key) + "=" + encodeURIComponent(params[key])
            if (encoded_params != "") {
                encoded_params += "&"
            }
            encoded_params += encoded_param
        }

        return fetch(api_url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: encoded_params
        })
    }
}
