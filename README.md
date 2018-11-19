# TactileJS
TactileJS is a Javascript library for representing, manipulating, and drawing tilings of the plane.  The tilings all belong to a special class called the _isohedral tilings_. Every isohedral tiling is formed from repeated copies of a single shape, and the pattern of repetition is fairly simple. At the same time, isohedral tilings are very expressive (they form the basis for a lot of the tessellations created by M.C. Escher) and efficient to compute.

I created the first versions of Tactile in the late 1990s, while working on my [PhD][phd].  This Javascript library is a port of the analogous [C++ library][tactile] I created as a modern upgrade of the original Tactile. The core library is completely self-contained; I also provide a demo based on Tactile, [`P5.js`][p5js], and [`QuickSettings`][quickset]. Of course, the goal is not simply to use the demo page as-is, but rather to explore new applications of the library in an interactive web-based context.

I will provide more complete documentation here in the near future.  In the meantime it is possible to understand how to use the library by reading the source code of the demo programs, especially the thoroughly documented `demo/psdemo.cpp`.

[phd]: http://www.cgl.uwaterloo.ca/csk/phd/
[p5js]: https://p5js.org/
[quickset]: https://github.com/bit101/quicksettings
[tactile]: https://github.com/isohedral/tactile
