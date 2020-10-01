# Wikiflow

Custom tooling to implement a poor man's version of Gitflow on Mediawiki, and more specifically on the [MedMij environment of the informatiestandaarden wiki](http://informatiestandaarden.nictiz.nl/wiki/MedMij:V2020.01)(yes, it's a very custom tool with some hardcoded assumptions about URL layout etc.) These tools are available as a browser extension, which can be installed in Firefox (or other browser, if you're willing to use a developer mode in order to sideload extensions). See the [releases section](https://github.com/Nictiz/Nictiz-tooling-wikiflow/releases] for an installable version.

This extension offers the following functionality:

* Creating issue pages from any MedMij:V2019.01 or MedMij:V2020.01 page
* Automerging issue pages from MedMij:V2019.01 or Vprepub pages
* Conflict resolution using three-way diff/merge when integrating issue pages.

This extension uses and redistributes the following libraries:

* [CodeMirror](https://codemirror.net/index.html)
* [diff-match-patch](https://github.com/google/diff-match-patch)
* [node-diff3](https://www.npmjs.com/package/node-diff3)