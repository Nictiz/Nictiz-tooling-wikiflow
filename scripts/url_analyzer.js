/**
 * Analyze the title of a wiki page according to the Wikiflow naming conventions.
 * 
 * Upon succesful analysis, this object contains the relevant information in the keys below. Optional fields may be
 * unset. When the title can't be analyzed, none of the fields will be set.
 * - realm: "production", "prepub" or "issue"
 * - title: The actual title of the page, without version info and such. This will be in the URL format, with
 *          underscores instead of spaces.
 * - namespace: The full namespace of the current page (mainnamespace and subnamespace), if any, including the ":".
 *              This is a computated field that is always available, although it may be an empty string.
 * - mainnamespace: The namespace of the current page, if any, without the ":".
 * - subnamespace: The subnamespace following the namespace (following the main namespace), if any, without the ":".
 * - version: The version according to the title (without the leading "V"). Only filled when real is "production" or
 *            "prepub".
 * - issue_id: The issue id for the current page. Only filled if realm is "issue".
 * 
 * @param {string} [title] - The page title to analyze. May also be set using setTitle()
 */
class TitleAnalyzer {
    constructor(title = null) {
        this.setTitle(title)
    }

    /**
     * Set the/a new title of this analyzer. See the class documentation for more information.
     * @param {string} title
     */
    setTitle(title) {
        // Reset all fields
        delete this.realm
        delete this.title
        delete this.namespace
        delete this.subnamespace
        delete this.separator
        delete this.version
        delete this.issue_id

        if (title != null) {
            this._analyzeTitle(title)
        }
    }

    /** 
     * Analyze the title and extract the relevant parts according to the convention.
     * Upon success, all relevant fields will be filled.
     * 
     * @param {string} title - The title to analyze
     */
    _analyzeTitle(title) {
        title = title.replace(new RegExp(" ", "g"), "_") // Normalize the title to URL format, using underscores instead of spaces

        let parts = title.match(/^(?<mainnamespace>[A-Za-z]+:)?(?<subnamespace>[A-Za-z:]+:)?V(?<realm>issue-|prepub-)?(?<version>.*?)(?<separator>[_\/])(?<title>.*)$/)

        if (parts !== null) {
            let groups = parts.groups
            if ("title" in groups && "separator" in groups && "version" in groups && "realm" in groups) {
                this.title     = groups["title"]
                this.separator = groups["separator"]
                if ("mainnamespace" in groups) {
                    this.mainnamespace = groups["mainnamespace"].split(":")[0]
                }
                if ("subnamespace" in groups && groups["subnamespace"] != undefined) {
                    this.subnamespace = groups["subnamespace"].split(":")[0]
                }
                if (groups["realm"] == "issue-") {
                    this.realm = "issue"
                    this.issue_id = groups["version"]
                } else if (groups["realm"] == "prepub-") {
                    this.realm = "prepub"
                    this.version = groups["version"]
                } else {
                    this.realm = "production"
                    this.version = groups["version"]
                }
            }
        }
    }

    /**
     * Return the full namespace in the form of "namespace:subnamespace:", or only "namespace:" if no subnamespace is
     * present.
     */
    get namespace() {
        let namespace = "";
        if (this.mainnamespace) {
            namespace = this.mainnamespace + ":"
            if (this.subnamespace) {
                namespace += this.subnamespace + ":"
            }
        }
        return namespace
    }
}

/**
 * Analyze the url according to the Wikiflow naming conventions.
 * 
 * Upon succesful analysis, this object contains the relevant information in the keys below. Optional fields may be
 * unset. When the URL can't be analyzed, none of the fields will be set.
 * - type: "read" for regular pages, "create" for pages that are being created, or "edit" for pages that are being 
 *         edited
 * - search_params: the URLSearchParameters object for this URL. Will only be set when type is "create" or "edit".
 * - plus all the fields from TitleAnalyzer.
 * 
 * @param {string} [url = the current URL] - The url to analyze.
 */
class URLAnalyzer extends TitleAnalyzer {
    constructor(url = null) {
        super()

        if (url === null) {
            url = window.location.href
        }
        let url_obj = new URL(url)
    
        if (url_obj.pathname == "/index.php") { // Might be a creation URL
            let params = url_obj.searchParams
            if (params.has("action") && params.get("action") == "edit") {
                this.setTitle(params.get("title"))
                if (this.title) {
                    this.search_params = params
                    if (document.getElementsByClassName("mw-newarticletext").length > 0) { // A div with this id is unique for newly created pages
                        this.type = "create"
                    } else {
                        this.type = "edit"
                    }
                }
            }
        } else if (url_obj.pathname.startsWith("/wiki/")) { // Read URL, let's see if we can interpret it
            let wiki_url = url_obj.pathname.replace(/^\/wiki\//, "")
            this.setTitle(wiki_url)
            if (this.title) {
                this.type = "read"
            }
        }
    }
}