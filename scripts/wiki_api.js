/** 
 * Interact with the wiki API.
 *
 * This class provides only a thin layer over the mediawiki api. Most calls 
 * aren't abstracted away, as the Mediawiki api is pretty good already.
 *  
 * WARNING: Contains some assumptions about the Informatiestandaarden wiki.
 */
class WikiApi {
    constructor() {
        // Construct the url for the API calls, which is assumed to be "/api.php"
        // directly on the host name.
        // WARNING: This is a unique configuration for the Informatiestandaarden wiki.
        let url = new URL(window.location.href)
        url.pathname = "api.php"
        url.search   = ""
        this.api_url = url.toString()

        /**
         * Operations that change content require a csrf token. Since this is an asynchronous call, it will be stored
         * in a Promise.
         */
        this._token_querying = null
    }

    /**
     * Generic function to call the query action.
     * @param {Object} parameters - an object with the parameters to query on.
     * @returns {Promise<Object|Error>} - on success, an Object is returned containing the contents of the "query" key
     *                                    from the response.
     */
    async query(parameters) {
        parameters["action"] = "query"
        let json = await this._getJSON(parameters)
        if ("query" in json) {
            return json["query"]
        } else if ("warnings" in json) {
            throw new Error(`Error querying the wiki API with the following warnings: ${JSON.stringify(json["warnings"])}`)
        } else {
            throw new Error("Error querying the wiki API.")
        }
    }

    /** 
     * Query the wikitext content for a given page.
     * @param {Object} query_key - a query key as understood by the AI "parse" action to select the specified page, with a key and a value
     * @returns {Promise<Object|Error>} - an object with the following keys:
     *                                  - "title": the title of the page
     *                                  - "wikitext": the raw wikitext
     *                                  - "pageid": the page id
     *                                  - "revid": the id of the used revision
     */
    async getWikiText(query_key) {
        // Build upon the query key object to construct the query payload
        query_key["action"] = "parse"
        query_key["prop"]   = "wikitext|revid"

        let json = await this._getJSON(query_key)
        
        if ("error" in json) {
            throw new Error(`Error fetching wiki page using query "${JSON.stringify(query_key)}": ` + json["error"]["info"])
        }
        try {
            let wikitext = json.parse.wikitext["*"]
            let title    = json.parse.title
            let pageid   = json.parse.pageid
            let revid    = json.parse.revid
            if (wikitext != null && pageid != null && revid != null) {
                return {wikitext: wikitext, title: title, pageid: pageid, revid: revid}
            }
        } catch (error) {
            // One of the expected keys was not found in the response
            throw new Error(`Error fetching wiki page using query "${query_key}". The expected information was not found in the response from the Wiki API: ${JSON.stringify(json)}`)
        }
    }

    /**
     * Change the text of a wiki page.
     * NOTE: No conflict checking is done here, it is assumed that the operation is safe to proceed.
     * 
     * @param {number} page_id - the id of the page to change.
     * @param {string} new_text - the new wikitext.
     * @param {string} [summary] - the summary for the change.
     * @param {boolean} [is_minor=false] boolean to indicate if the change should be marked as a minor edit.
     */
    async changePageText(page_id, new_text, summary = "", is_minor = false) {
        let token = await this._getToken()
        let json = await this._postJSON({
            action:  "edit",
            text:    new_text,
            summary: summary,
            minor:   is_minor,
            pageid:  page_id,
            token:   token
        })
        if (!("edit" in json && json["edit"]["result"] == "Success")) {
            throw new Error(`Failed to change page text for page id ${page_id}. Response was: "${JSON.stringify(json)}"`)
        }
    }

    /**
     * Delete a page by page id, without leaving a redirect or message behind.
     * 
     * @param {number} page_id - the id of the page to delete.
     */
    async deletePage(page_id) {
        let token = await this._getToken()
        let json = await this._postJSON({
            action: "delete",
            pageid: page_id,
            token:  token
        })
        if (!("delete" in json)) {
            throw new Error(`Failed to delete page with page id ${page_id}. Response was: "${JSON.stringify(json)}"`)
        }
    }

    /**
     * Move (rename) a page by id, without leaving a redirect behind.
     * @param {number} page_id - The id of the page to rename.
     * @param {string} new_title - The new title of the page.
     * @returns {Promise<Object|Error>} - On success, an Object is returned containing the "from" and "to" keys.
     */
    async movePage(page_id, new_title) {
        let token = await this._getToken()
        let json = await this._postJSON({
            action:     "move",
            fromid:     page_id,
            to:         new_title,
            noredirect: true,
            token:      token
        })
        if ("move" in json) {
            return json["move"]
        }
        throw new Error(`Failed to move page with page id ${page_id}. Response was: "${JSON.stringify(json)}"`)
    }

    /**
     * Protect a page by id (or remove its protections)
     * @param {number} page_id - The id of the page to protect
     * @param {string} protections - The protections to set -- see the documentation on the MediaWiki API for format 
     * @param {string} reason - The reason this page is protected
     * @returns {Promise<Object|Error>} - On success, an Object is returned containt the "protect" output from the api
     */
    async protectPage(page_id, protections, reason) {
        let token = await this._getToken()
        let json = await this._postJSON({
            action:      "protect",
            pageid:      page_id,
            protections: protections,
            reason:      reason,
            token:       token
        })
        if ("protect" in json) {
            return json["protect"]
        }
        throw new Error(`Failed to protect page with page id ${page_id}. Response was: "${JSON.stringify(json)}"`)
    }

    /**
     * Create a new page with the supplied text.
     * @param {string} title - The title of the page to create
     * @param {string} text - The text of the page
     * @param {string} summary - The summary message for creating the new page
     */
    async createNewPage(title, text, summary) {
        let token = await this._getToken()
        let json = await this._postJSON({
            action:     "edit",
            title:      title,
            text:       text,
            createonly: true,
            summary:    summary,
            token:      token
        })
        if (!("edit" in json && json["edit"]["result"] == "Success")) {
            throw new Error(`Failed to create page with the ${title}. Response was: "${JSON.stringify(json)}"`)
        }
    }

    /**
     * Merge page history.
     * @param {string} source - The title of the page to merge the history from
     * @param {string} target - The title of the page to merge the history into
     * @param {string} summary - The summary message for creating the new page
     */
    async mergeHistory(source, target, summary) {
        let token = await this._getToken()
        let json = await this._postJSON({
            action:     "mergehistory",
            from:       source,
            to:         target,
            reason:     summary,
            token:      token
        })
        console.log(json)
        if ("mergehistory" in json) {
            return json["mergehistory"]
        }
        throw new Error(`Failed to merge history from ${from_title} to ${to_title}. Response was: "${JSON.stringify(json)}"`)
    }

    /**
     * Helper method to perform a GET operation on the wiki API URL in JSON format.
     * @param {Object} parameters - A JSON Object containing the parameters to send.
     * @returns {Promise<Object|Error} - The resonse in JSON format from the API, or an Error if the request fails.
     *                                   Note: a response doesn't actually mean that the API call has succeeded, you
     *                                   need to inspect the response to find out.
     */
    async _getJSON(parameters) {
        let url = new URL(this.api_url)
        Object.keys(parameters).forEach(key => {
            url.searchParams.append(key, parameters[key])
        })
        url.searchParams.append("format", "json")

        let response = await fetch(url)
        if (response.ok) {
            let json = response.json()
            return json
        }
        throw new Error(`Error querying the wiki api: got a response with status code ${response.status} and status text "${response.statusText}".`)
    }

    /**
     * Helper method to perform a POST operation, using the parameters as the body.
     * @param {Object} params - A JSON Object containing the parameters to send.
     * @param {string} [url] - An optional alternative URL to use. If omitted, the normal API url will be used.
     * @returns {Response} - the Resonse object as generated by fetch()
     */
    async _post(params, url = null) {
        // The wiki API only seems to accept an x-www-form-urlencoded POST 
        // body, so we need to construct the body manually in this form. 
        let encoded_params = ""
        for (const key in params) {
            let encoded_param = "&" + encodeURIComponent(key) + "=" + encodeURIComponent(params[key])
            encoded_params += ((encoded_params == "") ? "" : "&") + encoded_param
        }

        if (url === null) {
            url = this.api_url
        }

        let response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: encoded_params
        })
        return response
    }

    /**
     * Helper method to perform a POST operation on the wiki API in JSON format.
     * @param {Object} params - A JSON Object containing the parameters to send.
     * @param {string} [url] - An optional alternative URL to use. If omitted, the normal API url will be used.
     * @returns {Promise<Object|Error} - The resonse in JSON format from the API, or an Error if the request fails.
     *                                   Note: a response doesn't actually mean that the API call has succeeded, you
     *                                   need to inspect the response to find out.
     */
    async _postJSON(params, url = null) {
        params["format"] = "json"
        let response = await this._post(params, url)
        if (response.ok) {
            let json = response.json()
            return json
        }
        throw new Error(`Error POSTing to the wiki api: got a response with status code ${response.status} and status text "${response.statusText}".`)
    }

    /**
     * Query the csrf token. This token is needed for operations that change content on the wiki. A token can only be
     * retrieved by logged in users.
     * 
     * @returns {Promise<string|Error>} - On success, the result of the promise will be set to the token.
     */
    async _getToken() {
        if (this._token_querying == null) {

            this._token_querying = this.query({"meta": "tokens", "type": "csrf"}).then(tokens => {
                if ("tokens" in tokens && "csrftoken" in tokens["tokens"]) {
                    return tokens["tokens"]["csrftoken"]
                } else {
                    throw new Error("Couldn't retrieve token from the wiki API.")
                }
            })
        }

        return this._token_querying
    }
}
