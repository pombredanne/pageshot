/* globals Readability, microformats, watchFunction */
/* exported FILENAME */
/** extractor-worker is a content worker that is attached to a page when
    making a shot

    extractData() does the main work
    */

// Set for use in error messages:
var FILENAME = "extractor-worker.js";

/** Extracts data:
    - Gets the Readability version of the page (`.readable`)
    - Parses out microformats (`.microdata`)
    - Finds images in roughly the preferred order (`.images`)
    */
function extractData() {
  // Readability is destructive, so we have to run it on a copy
  var readableDiv = document.createElement("div");
  readableDiv.innerHTML = document.body.innerHTML;
  // FIXME: location.href isn't what Readability expects (but I am
  // working around the parts of the code that seem to expect
  // something different)
  var reader = new Readability(location.href, readableDiv);
  var readable = reader.parse();
  var microdata = microformats.getItems();
  // FIXME: need to include found images too
  var images = findImages([document.head, readableDiv, document.body]);
  return {
    readable: readable,
    microdata: microdata,
    images: images
  };
}

// Images smaller than either of these sizes are skipped:
var MIN_IMAGE_WIDTH = 250;
var MIN_IMAGE_HEIGHT = 200;

/** Finds images in any of the given elements, avoiding duplicates
    Looks for Open Graph og:image, then img elements, sorting img
    elements by width (largest preferred) */
function findImages(elements) {
  var images = [];
  var found = {};
  function addImage(url) {
    if (! url) {
      return;
    }
    // FIXME: handle relative links
    if (found[url]) {
      return;
    }
    images.push(url);
    found[url] = true;
  }
  for (var i=0; i<elements.length; i++) {
    var el = elements[i];
    var ogs = el.querySelectorAll("meta[property='og:image']");
    var j;
    for (j=0; j<ogs.length; j++) {
      var src = ogs[i].getAttribute("content");
      addImage(src);
    }
    var imgs = el.querySelectorAll("img");
    imgs = Array.prototype.slice.call(imgs);
    // Widest images first:
    imgs.sort(function (a, b) {
      if (a.width > b.width) {
        return -1;
      }
      return 1;
    });
    for (j=0; j<imgs.length; j++) {
      var img = imgs[j];
      if (img.width >= MIN_IMAGE_WIDTH && img.height >= MIN_IMAGE_HEIGHT) {
        addImage(img.src);
      }
    }
  }
  return images;
}

try {
  self.port.emit("data", watchFunction(extractData)());
} catch (e) {
  console.error("Error in extractor-worker.js:", e+"");
  console.trace();
  self.port.emit("alertError", {
    name: e.name || "ERROR",
    message: "Error in extractor-worker.js: " + e,
    help: "There was an error getting data from the page."
  });
}