
/** 
 * Rewrite wiki links and transclusons to a new environment, which is 
 * identified by the prefix.
 * @param prefix_from the prefix the should be replaced.
 * @param prefix_to the prefix that the original should be replaced with.
 * @param is_prefix_regex a boolean to indicate the the prefix_from should be
 *                        interpreted as a regular expression. Defaults to
 *                        false (aka a normal string). */
function PrefixRewriter(prefix_from, prefix_to, is_prefix_regex = false) {
    if (is_prefix_regex) {
        this.prefix_from = prefix_from
    } else {
        // Escape the special regex characters so we can include it in a regex
        this.prefix_from = prefix_from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    this.prefix_to = prefix_to

    this.rewrite = function(text) {
        // Rewrite wikilinks
        let re_links = new RegExp("\\[\\[" + this.prefix_from + "(.*?)(\\]\\]|\\|)", "g")
        let modified = text.replace(re_links, "[[" + this.prefix_to + "$1$2")

        // Rewrite transclusions (including labeled section transclusions)
        let re_includes = new RegExp("\{\{(#lst.:)?" + this.prefix_from + "(.*?)\}\}", "g")
        modified = modified.replace(re_includes, "{{$1" + this.prefix_to + "$2}}")

        return modified
    }
}