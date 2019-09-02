This folder contains the source code for an interactive Javascript tool that allows you to draw spiral tilings. See the blog post at http://isohedral.ca/escher-like-spiral-tilings/ for more information, including a link to a runnable version.

If you want to run this code yourself from source, you'll need to do a few things:

 * Stick a copy of the font Helvetica Neue in the assets folder. I grabbed a copy from https://github.com/AllThingsSmitty/fonts.
 * Stick a copy of `tactile.js` in the main folder. You can get that from `../lib` in this repository.
 * Grab the latest `p5.min.js` and `p5.dom.min.js` from the P5.js project (https://p5js.org/) and put them in the main folder too.
 * Run a web server. Because Chrome is afraid of cross-site scripting attacks, this script won't run via a `file:` URL.  It suffices to run Python's web server by executing "`python -m http.server`" from the command line while in the main directory.
