# Wikiflow

Custom tooling to implement a poor man's version of Gitflow on Mediawiki. It was specifically created for the [MedMij environment of the informatiestandaarden wiki](http://informatiestandaarden.nictiz.nl/wiki/MedMij:V2020.01), but _should_ be usable more broadly. However, it is only activated (and tested!) on said wiki pages.

This tool is available as a browser extension, which can be installed in Firefox for the simple reason that this is the only browser that allows sideloading extensions (you can use this extension in Chrome/Edge if you're willing to enable developer mode). See the [releases section](https://github.com/Nictiz/Nictiz-tooling-wikiflow/releases) for an installable version. As an extension, it doesn't affect the Mediawiki installation itself at all; instead it uses API calls and some web page scraping to do what it does.

This extension uses and redistributes the following libraries:

* [CodeMirror](https://codemirror.net/index.html)
* [diff-match-patch](https://github.com/google/diff-match-patch)
* [node-diff3](https://www.npmjs.com/package/node-diff3)

## Rationale: a poor man's Gitflow in Mediawiki

Over the last years, git has become the dominant version management control system, and in its wake Gitflow has become an important workflow for software development. Details of this workflow vary, but in broad terms it comes down to the following:

* The stable, released version of the software lives in the "stable" branch of the git repository (usually the branch called "master" or "main").
* All bugs and new features are developed in isolation in a seperate issue branch (usually with a name that corresponds to the ticket number in the issue tracker).
* All issue branches that are deemed mature enough are merged into a common staging or integration branch to be tested together.
* When the time has come for a new release, the staging/integration branch is merged into the stable branch.

This approach is well suited when there are many parallel tracks of development of improvement on the same system -- which is exactly the situation for the interface specifications that Nictiz maintains. There is a steady flow of enhancement requests and bug reports affecting many different parts of the same specification. For ach of these issues, a solution needs to be determined and the impact has to be asessed, and this has to be vetted among the stakeholders. And as ever so often is the case, while working on the solution, either of these initial estimations may turn out to be wrong.

That why the Gitflow approach has been adopted for the development of the technical artifacts. Using issue branches allows for solving and testing each solution individually, without initially having to worry about the changes introduced because of other issues, for example:

* If it turns out more time is needed to think about the solution, the issue can painlessly be moved to the next release.
* Likewise when the stakeholders would determine that the impact of the change is too high.
* It is possible to adopt a different solution halfway through, because no other issue solutions have been building upon the initial solution.
* Changes can also be reviewed more easily because they focus on the issue at hand.

Meanwhile, using an integration branch as an intermediate between the issue and stable branches means that there is ample time to check all the solutions in concert, building trust that the final stable release will be up to spec.

There's another big advantage of this approach: by squashing all tiny, trivial commits for one issue into one or a few clear, well-scoped commits, a meaningfull work log is built that can tell for each change when it was introduced, by whom, en (hopefully) why -- referring back to the ticket number in the issue tracker in the work log.

However, the a big part of these specifications consist of documentation, currently maintained using Mediawiki. Althoug there are some possibilities to connect wiki and git, but it is poorly maintained and git is not the easiest tool to use for a non-technical audience. So the question arised: could we adopt a Gitflow-_like_ workflow in Mediawiki? In order to realize this, we would, at the minimum, need the following ingredients:

* A way to distinguish different "branches" of the same artifacts.
* A way to "clone" artifacts into new issue branches.
* A way to track changes in a given "branch".
* A way to "merge" issue branches into the integration branch.
* A way to "merge" the integration branch to the main branch.

### Using the URL for "branches"

How would a branch on a website look like? In git, creating a branch means that every file is duplicated to that branch (well, from a user point of view); switching a branch means switching all files within the branch to the version in the branch. On a website, this would probably translate to somehow switching all pages to a version for that branch. It would also mean that any inter-site link would resolve to the version of the webpage that is part of the branch.

This is not attainable without changing the Mediawiki database and installation. However, a design goal of this project is to not alter Mediawiki itself (for various reasons). However, Mediawiki and especially the Informatiestandaarden wiki attach special meaning to the URL structure. This is something that can be built on.

Traditionally, an URL on the Informatiestandaarden wiki was built up like:
  
    http://informatiestandaarden.nl/wiki/[information standard namespace]:V[version]_[page title]

For draft pages, [version] would simply be replaced with something like "draft". This mechanism could simple be extended by using a "branch" name instead of [version]. The page title would be the unique identifier to track a page across "branches". However, to create a true branch, _all_ the pages would need to be duplicated and _all_ the inter-site links would need to be rewritten, which would create a lot of overhead. Still, it's a good starting point.

### Cloning and merging

Cloning is probably the easiest of all requirements for a Mediawiki page, as an existing page can simple be copied to a new page. However, the page history is not copied, which is an important feature of Gitflow. This problem can be solved using the [Duplicator MediaWiki extension](https://www.mediawiki.org/wiki/Extension:Duplicator) (this requires a change to the installation, but it is trivial).

Merging back changes is harder. There is also no standard way to merge two pages on Mediawiki, let alone to intelligently merge two pages which share a common ancestor so that changes on both sides can be smoothly incorporated. This is where this tool comes in. The MediaWiki API can be queried for the source pages and using a combination of [node-diff3](https://www.npmjs.com/package/node-diff3) and [diff-match-patch](https://github.com/google/diff-match-patch) the basic git merge algorithm can be re-implemented. When merge conflicts occur, [CodeMirror](https://codemirror.net/index.html) offers a great interface to manually manage 3-way merges.

There just one fly in the ointment: unlike git, Mediawiki has no idea of what the common ancestor is when merging two pages, which is essential. It's also hard to do a full comparison between an entire set of pages of different branches.

### Rebuilding Git*Flow* rather than git

However, a workable solution can be created by recognizing that this tool is specifically aimed at recreating Git*Flow*; it doesn't need to rebuild git in general. This allows for some shortcuts:

1. Issue pages:
    1. Don't require all pages to be duplicated (typically an issue affects only a handful of pages).
    2. Don't actually require the full version history of the page it was cloned from.
    3. _Do_ require that the original ancestor is remembered.
    4. Should, ideally, warn users that this is a working page and warn search engines that it shouldn't be indexed.
2. Prepub pages:
    1. Require the full set of pages to be duplicated, with links and transclusions rewritten (in a staging environment, the integration of an issue needs to be validated).
    2. Require the full version history (or the ability to merge the new version history with the live branch, but see the following bullet).
    3. Don't actually need merging -- in a GitFlow situation, they simply can overwite the live branch.
    4. Should, ideally, warn users that this is a working page and warn search engines that it shouldn't be indexed.
3. Live pages:
    1. Should never change in a GitFlow situation.
    2. Should be indexed.

With these aspects in mind, a practical solution can be realized, which is described in the next section.

### Drawbacks

Of course, some important git features missing from this approach. For example, it is not possible to rebase an issue page that has been stale for a while, or to merge the upstream changes into it. The limited set of featurs that this tool offers, should however be enough to cover most scenarios.

## In practice

### Tiers and environments

Recognizing that three tiers of pages are needed, it is possible to create a general format for the URLs ("branches") of these different tiers:

* Live pages will be found at: `[base]/[namespace]:V[version]_[page title]`. There will be only issue pages for pages that need to be edited.
* Prepub pages will be found at: `[base]/[namespace]:Vprepub-[version]_[page title]`. The full set of live pages will be duplicated here.
* Issue pages will be found at: `[base]/[namespace]:Vissue-[issue id]_[page title]`

It should be understood that adopting this approach is an all-or-nothing affair, but only for a specific combination of namespace and version. Any combination might use its own rythm for a release cycle or might opt to not use this approach altogether.

The live and prepub tier for a specific combination of namespace and version will be referred to as an _environment_. For example, all pages starting with URL path `/MedMij:Vprepub-2020.01...` belong to the prepub environment for MedMij version 2020.01.

### Creating an issue page

Creating an issue page is _always_ done from a live page. Issue pages should be created for any page which needs to be edited. When this tool is installed (and the logged in user has edit rights), a new tab will appear that offers the option to create a new issue page. When the user clicks on this tab, a popup appears to fill in the issue id; this is needed to create the proper URL.

This action will perform the following steps.

* Create a new issue page with the proper URL.
* Populate it with the text from the live page.
* Rewrite the links to pages within the same environment to their prepub counterpart.
* Make sure that the page isn't indexed.
* Add a notebox that this is a temporary page.
* And then _save the page directly before any edits can be made_. This is needed to define a common ancestor when merging back the changes; the first edit is considered the common ancestor. Note that this page is new; it doesn't include any history from the source page.

### Editing an issue page

The issue page can then be edited like any normal wiki page. The new history built up here will eventually be discarded, so no particular care needs to be taken to the edit messages.

Some care need to be taken for links and transclusions within the same environment. These default to the prepub version of these pages and will transparantly be rewritten to the live versions during publication. If needed, a link/transclusion to another issue page can be made -- this will be transparently rewritten to the prepub version when merging to prepub. In editing, when working with links/transclusions:

* If they are to pages within the same environment:
  * Use the prepub version or another issue page. If the live page is used instead, then in the staging phase, the prepub will not be a faithful representation on the new situation.
* If they are to pages not within the same environment:
  * Use the live pages. Merging and publishing will only rewrite links within the same environment, any other links end up verbatim in the live page.

### Merging an issue page to prepub

Integrating edits to the prepub environment is again done from the issue page, on a page-by-page basis, just like with creating issue pages. Each issue page has a tab to perform this action. When clicking this tab, the user should indicate which version the page should be integrated to -- a prori there is no "correct" version, but usually it will be the version from which the issue page was created. Clicking this tab will perform the following actions:

* Open the corresponding prepub page in edit mode.
* Retrieve the text from the issue page.
* Rewrite links/transclusions to issue pages within the same environment to their prepub counterparts.
* Try to merge the text from the issue page with the current text on the prepub page (using the common ancestor to figure out where changes were introduced).
  * If this doesn't succeed, a three-way diff view will be opened to let the use manually integrate the edits.
  * If this succeeds, the normal edit area will contain the merged text. The user can manually enable the three-way diff view if needed.

The three-way diff view shows on the left text as it is on the issue page (with rewritten links, that is) and on the right the text as it _currently_ is on the prepub page. In the middle, the new text for the prepub page is shown. The user can then manually edit the middle section to resolve any merge conflicts.

The message filled out for this edit _will_ become part of the edit history and should be descriptive and contain a reference to the issue underlying the changes. Therefore, this tool will do a basic check if the message is long enough and mentions the issue id.

Note: a marked difference with git is that not the name of the change author will be attached to the edit, but the name of the person performing the merge.

### Editing prepub pages

Prepub pages can be edited like any other MediaWiki page. However, each edit here will show up in the version history on the live page. Thus as a general rule, it shouldn't be done unless procedures are in place to do so. For example, an agreement can be made that typos may be fixed on prepub pages directly.

Note: unlike git, it is not possible to rewrite history and correct faulty edits. Take care before you save an edit!

### Publishing prepub to live

Publishing the prepub environment to the live environment can only be done by MediWiki users with elevated permissions, as it involves deleting and duplicating pages.

For publishing prepub to live, a special interface is available, which can be opened by clicking on the address bar button on the main Informatiestandaarden page (the original tab may not be closed when using this interface). This interface offers in fact four options:

* Publish a prepub environment to the corresponding live environment:
  * Delete all live pages for the corresponding live environment.
  * Duplicate all pages in the prepub environment to their live counterparts, including full edit history.
  * Rewrite all links/transclusion to the same prepub environment to the live environment.
  * Remove the warning box that.
  * Enable indexing for these pages.
  * Protect the live pages against accidental editing.
* Create a new prepub environment from a live environment:
  * Duplicate all pages in the live environment to a prepub counterpart, including full edit history.
  * Rewrite all links/transclusions to the same live environment to the prepub version.
  * Add a warning that this is a temporary page.
  * Make sure these pages aren't indexed.
* Duplicate an environment:
  * Duplicate all pages in some environment to a counterpart in another environment, including full edit history. Can only be done if the target environment doesn't exist.
* Remove an environment:
  * Remove all pages in some environment.

The last three options are useful for maintenance, the usual action is to publish a prepub environment to the live environment.

For each of these actions, the full environment prefix (with namespace, tier and version) is required. For example, when publishing the prepub environment for MedMij 2020.01, "MedMij:Vprepub-2020.01" is required as source prefix. The target prefix will be constructed from the source and the chosen action (except when duplicating an environment, in which case the target prefix needs to be given).

When the prefix and action are selected, the user first needs to click on the search button to get an overview of all changes that will be made to each page. If needed, pages may be excluded from the action by unchecking the checkbox next to them. The action button will then perform all required actions. For each page, the result of each action will be shown.

Note that publishing will result in three extra edit messages for the live pages: one for the duplication, one for the link rewriting, and one for enabling page protection.