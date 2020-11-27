class PrefixRewriter {
    /** 
     * Rewrite wiki links, transclusons and "link" parameters in [[File:]] inclusions to a new environment, which is
     * identified by the prefix.
     * 
     * WARNING: Mediawiki syntax is language-dependent! This class only supports the English and Dutch flavors.
     * 
     * @param {string} prefix_from - the prefix the should be replaced.
     * @param {string} prefix_to - the prefix that the original should be replaced with.
     * @param {boolean} [is_prefix_regex=false] - a boolean to indicate the the prefix_from should be interpreted as a
     *                                            regular expression.
     */
    constructor(prefix_from, prefix_to, is_prefix_regex = false) {
        if (is_prefix_regex) {
            this.prefix_from = prefix_from
        } else {
            // Escape the special regex characters so we can include it in a regex
            this.prefix_from = prefix_from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
        this.prefix_to = prefix_to
    }

    /**
     * Replace the prefixes in the given text.
     * @param {string} text - the text to rewrite
     * @returns {string} - the rewritten text
     */
    rewrite(text) {
        // Rewrite wikilinks
        let re_links = new RegExp("\\[\\[" + this.prefix_from + "(.*?)(\\]\\]|\\|)", "g")
        let modified = text.replace(re_links, "[[" + this.prefix_to + "$1$2")

        // Rewrite transclusions (including labeled section transclusions)
        let re_includes = new RegExp("\{\{(#lst.?:)?" + this.prefix_from + "(.*?)\}\}", "g")
        modified = modified.replace(re_includes, "{{$1" + this.prefix_to + "$2}}")

        // Rewrite links in file references
        let re_files = new RegExp("\\[\\[(Bestand|File):(.*?)\\|link=" + this.prefix_from, "g")
        modified = modified.replace(re_files, "[[$1:$2|link=" + this.prefix_to)
        
        return modified
    }
    
    /**
     * Check if the from_prefix is still present _somewhere_ in the rewritten text. This check is not restricted to
     * links, transclusion and file links, so it can be used as a general sanity check.
     * @param {string} rewritten_text 
     */
    containsPrefixFrom(rewritten_text) {
        if (rewritten_text.match(new RegExp(this.prefix_from))) {
            return true
        }

        return
    }
}