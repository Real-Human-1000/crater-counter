// Some resources:
// URL for individual tiles:
// (last 3 numbers are scale, row, and column)
// https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/3/7.png

// https://api.nasa.gov/
// https://github.com/bilal-karim/gmaps-samples-v3/blob/master/planetary-maptypes/planetary-maptypes.html#L44
// https://developers.google.com/maps/documentation/javascript/examples/maptype-image#maps_maptype_image-javascript


class Ray {
  // Class for lines defined by vectors
  // This class is handy because one Ray will store both a position and a direction
  constructor(position, direction, infinite, bidirectional) {
    this.pos = position;  // p5.Vector; starting position in space
    this.dir = direction;  // p5.Vector; direction (and length) of line
    this.inf = infinite;  // Boolean; whether this line extends infinitely in the direction of dir
    this.bi = bidirectional;  // Boolean; whether this line also extends backwards by the same length as dir (and/or infinitely)
  }
  
  distanceTo(ray) {
    // Shortest distance along this ray to another ray
    // Input: ray (p5.Vector)
    // Output: scalar
    // intersection formula taken from
    // https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection#Given_two_points_on_each_line_segment
    let p1 = p5.Vector.add(this.pos, this.dir);
    let p2 = p5.Vector.add(ray.pos, ray.dir);
    let t_num = (this.pos.x - ray.pos.x) * (ray.pos.y - p2.y) - (this.pos.y - ray.pos.y) * (ray.pos.x - p2.x);
    let t_denom = (this.pos.x - p1.x) * (ray.pos.y - p2.y) - (this.pos.y - p1.y) * (ray.pos.x - p2.x);
    let t = t_num / t_denom;
    
    if (!isFinite(t)) {
      // Lines are parallel
      return -1;  // error
    }
    if (t < 0 && !this.bi) {
      // Ray doesn't go through this point, since it's directional
      return -1;  // error
    }
    if (t > 1 && !this.inf) {
      // Ray doesn't go up to this point, since it's finite
      return -1;  // error
    }
    return t;
  }
  
  pointAt(t) {
    // Vector representing coordinates of point at distance t along this ray
    // Input: t (scalar)
    // Output: p5.Vector
    return p5.Vector.add(p5.Vector.mult(this.dir, t), this.pos);
  }
}


class Ellipse {
  // A useful class to have to store information about individual ellipses in a single package
  constructor(center, major, minor, angle, p1, p2) {
    this.center = center;  // 2-Vector
    this.major = major;  // scalar
    this.minor = minor;  // scalar
    this.angle = angle;  // scalar
    this.p1 = p1;  // 2-Vector
    this.p2 = p2;  // 2-Vector
    this.col = createVector(255,0,0);  // 3-Vector
    this.thispoi = [];  // mini-poi list to keep track of which points contributed to this ellipse
  }
}


// Crater-counting-related variables
let gradientShader;  // A shader is a high-performance program that can do calculations on many pixels at once. This one will calculate our image gradient
let fb;  // A FrameBuffer, which will be used to calculate the image gradient
let ellipses = [];  // A list of ellipse objects
let sThresh = 7;  // Threshold for similarity of semiminor axes, in pixels
let binThresh = 0.2;  // Threshold for a bin to be counted as an ellipse, in votes / unit circumference
let minPointsThresh = 8;  // The votes / unit circumference metric overvalues small ellipses, so this is a minimum number of points required to count as an ellipse
let calculatingEllipses = false;
let p1 = 0;  // indices for ellipse calculation
let p2 = -1;
let poi = [];  // list of points-of-interest; ray objects that represent the edges on the canvas

// Camera- and view-related variables
let cameraPos;  // A 2-Vector denoting the location of the top-left-most pixel of the canvas in Mars-space
let lastCameraPos;  // A 2-Vector that will store the camera's position one frame previous. Used to see when we need to load more images
let topLeftImage;  // These four are images that we will count craters on. Since it takes a while to load them from the internet, we should store them in memory
let topRightImage;
let bottomLeftImage;
let bottomRightImage;
let ellipsesImage;  // Testing image
let viewImage;  // Save us some time by caching the canvas

let textfont;

let loadMars = true;

let canva;


function preload() {
  // preload is used to load large pieces of data before everything else starts
  gradientShader = loadShader("data/gradient.vert", "data/gradient.frag");
  
  // Load some starting images
  topLeftImage = loadImage("https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/3/7.png");
  topRightImage = loadImage("https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/3/8.png");
  bottomLeftImage = loadImage("https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/4/7.png");
  bottomRightImage = loadImage("https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/4/8.png");
  ellipsesImage = loadImage("data/ellipses.png");
  
  textfont = loadFont("data/Hack-Regular.ttf");
}


function setup() {
  // Setting up the basics that are required for drawing things onto the screen
  canva = createCanvas(256,256,WEBGL);
  canva.parent("htmlcanva");
  fb = createFramebuffer();
  fb.pixelDensity(1.0);
  
  // We'll aim for 30 frames per second to keep the framerate more consistent
  frameRate(60);
  
  cameraPos = createVector(7.5,3.5);
  lastCameraPos = createVector(7.5,3.5);
  
  // Put some text up in case we have issues loading or drawing our Mars images
  // (we always have issues loading or drawing our Mars images)
  textFont(textfont);
  textSize(10);
  textAlign(CENTER, CENTER);
  fill(0);
  stroke(0);
  text("Please press any arrow key or WASD", 0, 0);
  textAlign(CORNER, CORNER);
  
  updateImages();
  if (loadMars) {
    drawMars();
  } else {
    image(ellipsesImage, -width/2, -height/2);
  }
  viewImage = get();
}


function draw() {
  // This function is called every frame (approximates real-time interaction)
  
  // Move the camera
  // For each if-statement, we need to make sure that we aren't going to leave the bounds of our data
  // Also, I want to decouple this movement from the framerate so that the camera mves the same distance in the same time no matter what the framerate is
  let moved = false;
  if ((keyIsDown(LEFT_ARROW) || keyIsDown(65)) && cameraPos.x > 0.1) {
    cameraPos.x -= 0.25 * deltaTime/1000;
    moved = true;
  }
  if ((keyIsDown(RIGHT_ARROW) || keyIsDown(68)) && cameraPos.x < 16-0.1) {  // for zoom 3, 16
    cameraPos.x += 0.25 * deltaTime/1000;
    moved = true;
  }
  if ((keyIsDown(UP_ARROW) || keyIsDown(87)) && cameraPos.y > 0.1) {
    cameraPos.y -= 0.25 * deltaTime/1000;
    moved = true;
  }
  if ((keyIsDown(DOWN_ARROW) || keyIsDown(83)) && cameraPos.y < 9-0.1) {  // for zoom 3, 9
    cameraPos.y += 0.25 * deltaTime/1000;
    moved = true;
  }
  
  
  // Draw the background of Mars (if the camera has moved. Otherwise, don't bother)
  // The camera isn't always on integer points, so we need to pull 4 different images with which to compose our background
  if (moved) {
    poi = [];
    ellipses = [];
    calculatingEllipses = false;
    if (loadMars) {
      drawMars();
    } else {
      image(ellipsesImage, -width/2, -height/2);
    }
    viewImage = get();
  } else if (calculatingEllipses) {
    // Continue calculating ellipses
    if (poi.length == 0) {
      // We don't have information about the edges of the current scene
      poi = findPOI(viewImage);
      image(viewImage, -width/2, -height/2);
      drawPOI();
    }
    
    p2 ++;
    if (p2 >= poi.length) {
      p2 = 0;
      p1++;
      image(viewImage, -width/2, -height/2);
      drawPOI();
      if (p1 >= poi.length) {
        p1 = -1;
        p2 = -1;
        calculatingEllipses = false;
        return;
      }
    }
    //print(p1, p2, 1000/deltaTime);
    stepFindEllipses(viewImage);
    drawEllipses();
  } else {
    // Draw ellipses
    if (loadMars) {
      drawMars();
    } else {
      image(ellipsesImage, -width/2, -height/2);
    }
    drawEllipses();
  }
}


function keyReleased() {
  // I want to add some interactivity, so with this function we'll be able to record when the user stops pressing keys on their keyboard
  // We need to re-calculate ellipses when the user stops pressing all movement keys (WASD and/or arrow keys)
  if (!(keyIsDown(LEFT_ARROW) || 
      keyIsDown(RIGHT_ARROW) || 
      keyIsDown(UP_ARROW) || 
      keyIsDown(DOWN_ARROW) || 
      keyIsDown(65) || // A
      keyIsDown(68) || // D
      keyIsDown(87) || // W
      keyIsDown(83))) {  // S
    print("All of the movement keys have been released");
  }
  // This "return false" is used to stop other default behaviors, like scrolling the whole page up or something
  return false;
}


function keyPressed() {
  if (keyCode == 32) {
    // Set the flag to calculate ellipses
    calculatingEllipses = true;
    drawText("Finding Edges");
    p1 = 0;
    p2 = 0;
  }
  if (keyCode == 61) {
    // You can use +/= to switch between Mars-view and Test-view
    loadMars = !loadMars;
  }
  return false;
}


function drawText(txt) {
  // Helper function to draw some text in the corner
  push();
  rectMode(CORNER);
  fill(0);
  stroke(0);
  textSize(15);
  let bounds = textfont.textBounds(txt, 5-width/2, 15-height/2);
  rect(bounds.x-2.5, bounds.y-2.5, bounds.w+5, bounds.h+5);
  stroke(255);
  fill(255);
  strokeWeight(5);
  textFont(textfont);
  text(txt, 5-width/2, 15-height/2);
  pop();
}


function drawEllipses() {
  push();
  stroke(255,0,0);
  noFill();
  rectMode(CENTER);
  for (let e = 0; e < ellipses.length; e++) {
    push();
    stroke(ellipses[e].col.x, ellipses[e].col.y, ellipses[e].col.z);
    for (let p = 0; p < ellipses[e].thispoi.length; p++) {
      ellipse(ellipses[e].thispoi[p].pos.x-width/2, ellipses[e].thispoi[p].pos.y-height/2, 2, 2);
    }
    rect(ellipses[e].p1.x - width/2, ellipses[e].p1.y - height/2, 3, 3);
    rect(ellipses[e].p2.x - width/2, ellipses[e].p2.y - height/2, 3, 3);
    translate(ellipses[e].center.x - width/2, ellipses[e].center.y - height/2);
    rotate(ellipses[e].angle);  // Positive is clockwise
    ellipse(0, 0, ellipses[e].major, ellipses[e].minor);
    pop();
  }
  pop();
  drawText("Detected " + ellipses.length + " craters");
}


function drawMars() {
  // If the camera moved out of the range of the loaded images, we need to load new ones
  if (floor(cameraPos.x) != floor(lastCameraPos.x) || floor(cameraPos.y) != floor(lastCameraPos.y)) {
    updateImages();
  }
  
  lastCameraPos.x = cameraPos.x;
  lastCameraPos.y = cameraPos.y;
  
  // Draw our images
  // FYI these "-width/2" and "-height/2" are needed because the image is drawn from its top-left corner while the canvas is based around its center
  image(topLeftImage, -width * fract(cameraPos.x) - width/2, -height * fract(cameraPos.y) - height/2);  
  image(topRightImage, width - width * fract(cameraPos.x) - width/2, -height * fract(cameraPos.y) - height/2);
  image(bottomLeftImage, -width * fract(cameraPos.x) - width/2, height - height * fract(cameraPos.y) - height/2);
  image(bottomRightImage, width - width * fract(cameraPos.x) - width/2, height - height * fract(cameraPos.y) - height/2);
}


function updateImages() {
  // Update our images to keep up with the camera moving around to a new tile
  let topLeftPos = createVector(floor(cameraPos.x), floor(cameraPos.y));
  let topRightPos = createVector(ceil(cameraPos.x), floor(cameraPos.y));
  let bottomLeftPos = createVector(floor(cameraPos.x), ceil(cameraPos.y));
  let bottomRightPos = createVector(ceil(cameraPos.x), ceil(cameraPos.y));
  //print(topLeftPos);
  // Actually load the images
  topLeftImage = loadImage("https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/" + topLeftPos.y + "/" + topLeftPos.x + ".png");
  topRightImage = loadImage("https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/" + topRightPos.y + "/" + topRightPos.x + ".png");
  bottomLeftImage = loadImage("https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/" + bottomLeftPos.y + "/" + bottomLeftPos.x + ".png");
  bottomRightImage = loadImage("https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/3/" + bottomRightPos.y + "/" + bottomRightPos.x + ".png");
}


function getColorAt(img, x, y) {
  // Returns a 3-tuple of the RGB chanels at point (x, y) in img
  // I'm just going to assume that img already has loaded pixels
  let idx = (x + y*img.width)*4;
  return [img.pixels[idx+0], img.pixels[idx+1], img.pixels[idx+2]];
}


function getGradientAt(img, x, y) {
  // Given an image whose red and blue channels represent horizontal and vertical components of a gradient, find the gradient at (x,y)
  let col = this.getColorAt(img, x, y);
  return [col[0]/128-1, col[2]/128-1];
}


function shuffleArray(array) {
  // Randomize array in-place using Durstenfeld shuffle algorithm
  for (var i = array.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}


function argMax(array) {
  // A very cool argmax function from this thread https://gist.github.com/engelen/fbce4476c9e68c52ff7e5c2da5c24a28
  return [].reduce.call(array, (m, c, i, arr) => c > arr[m] ? i : m, 0)
}


function ellipseCircumference(a,b) {
  // Do NOT look up the formula for the circumference of an ellipse. Worst mistake of my life (that's a joke)
  // a and b should be the semimajor and semiminor axes of the ellipse
  // https://www.chrisrackauckas.com/assets/Papers/ChrisRackauckas-The_Circumference_of_an_Ellipse.pdf
  let h = sq((a - b) / (a + b));
  return PI * (a + b) * (64 + 3 * h*h) / (64 - 16 * h);
}


function findPOI(source) {
  // Find all points-of-interest on the canvas currently using edge detection
  // First, we need to calculate the image's gradient in order to find all edges
  // we want to load the gradient image into a framebuffer so it's easier to manipulate
  fb.begin();
  
  shader(gradientShader);
  
  // lets just send the source to our shader as a uniform
  gradientShader.setUniform('tex0', source);
  // the size of one pixel on the screen
  gradientShader.setUniform('stepSize', [1.0/width, 1.0/height]);
  // how far away to sample from the current pixel
  // 1 is 1 pixel away
  gradientShader.setUniform('dist', 1.0);
  // rect gives us some geometry on the screen
  rect(0,0, width,height);
  
  fb.end();
  
  // Now we need to pick out all the points of interest (poi) from the gradient image
  let newpoi = [];
  fb.loadPixels();
  fill(0,0,255,128);
  stroke(0,0,255,128);
  for (let y = 0*19*fb.height/25; y < 25*fb.height/25; y = y + fb.height/75) {  // It's very expensive to loop over every pixel, so we'll just do an evenly-distributed subset pixels
    for (let x = 0*1*fb.width/25; x < 25/12*12*fb.width/25; x = x + fb.width/75) {
      let grad = getGradientAt(fb, floor(x), floor(y));
      let normnorm = grad[0]*grad[0] + grad[1]*grad[1];  // max is about 0.25^2
      if ((normnorm > sq(0.2) && loadMars) || (normnorm > sq(0.8) && !loadMars)) {
        newpoi.push(new Ray(new p5.Vector(x, y), new p5.Vector(grad[0], grad[1]), false, false));
      }
    }
  }
  shuffleArray(newpoi);  // Just for testing purposes... or maybe forever
  return newpoi;
}


function drawPOI() {
  // Draw all of the ray objects in the list poi
  push();
  fill(0,0,255,128);
  stroke(0,0,255,128);
  for (let p = 0; p < poi.length; p++) {  // It's very expensive to loop over every pixel, so we'll just do an evenly-distributed subset pixels
    line(poi[p].pos.x-width/2,poi[p].pos.y-width/2,poi[p].pos.x+10*poi[p].dir.x-width/2,poi[p].pos.y+10*poi[p].dir.y-height/2);
    ellipse(poi[p].pos.x-width/2, poi[p].pos.y-width/2,2,2);
  }
  pop();
}


function stepFindEllipses(source) {
  // Here we will implement the procedure described in the report
  
  // poi is now a list of all points that could be edges of an ellipse
  // -----------------------------------> Here's where we really do the Xie & Ji calculations <-------------------------------------------
  // For each point, p1...
  //for (let p1 = 0; p1 < poi.length; p1++) {
  //  // For each point, p2...
  //  for (let p2 = 0; p2 < poi.length; p2++) {
      // Don't do calculations if points p1 and p2 are the same point
      if (p1 == p2) {
        return;
      }
      // We need to check to see whether our gradient agrees that these could be on the same line
      // The vector pointing from p1 to p2 needs to be along the same line (in the same direction or exactly opposite) as the gradient of both p1 and p2
      let angbtwn211 = abs(p5.Vector.angleBetween(p5.Vector.sub(poi[p2].pos, poi[p1].pos), poi[p1].dir));
      let angbtwn121 = abs(p5.Vector.angleBetween(p5.Vector.sub(poi[p1].pos, poi[p2].pos), poi[p1].dir));
      let angbtwn212 = abs(p5.Vector.angleBetween(p5.Vector.sub(poi[p2].pos, poi[p1].pos), poi[p2].dir));
      let angbtwn122 = abs(p5.Vector.angleBetween(p5.Vector.sub(poi[p1].pos, poi[p2].pos), poi[p2].dir));
      //print("Angles: ", floor(angbtwn211 * 180/PI), floor(angbtwn121 * 180/PI), floor(angbtwn212 * 180/PI), floor(angbtwn122 * 180/PI));
      if (max(min(angbtwn211, angbtwn121), min(angbtwn212, angbtwn122)) < PI/6) {  // 30 degrees = PI/6 radians
        // These two points, p1 and p2, can be said to lie on the major axis of an ellipse
        let accumulator = [];  // Each bin in the accumulator will be represented by a 3-tuple [value, accumulation, [points idxs]]
        let center = p5.Vector.div(p5.Vector.add(poi[p1].pos, poi[p2].pos), 2);  // this is our x_0 and y_0, as a vector
        let semimajor = p5.Vector.dist(poi[p1].pos, poi[p2].pos) / 2;
        let alpha = atan2(poi[p2].pos.y - poi[p1].pos.y, poi[p2].pos.x - poi[p1].pos.x);
        //if (semimajor > 50) {
        //  // abusing the fact that we're mostly interesting in smaller craters
        //  // (and the algorithm seems to go haywire with big craters)
        //  continue;
        //}
        for (let p = 0; p < poi.length; p++) {
          // Don't do calculations if p is the same as p1 or p2
          if (p == p1 || p == p2) {
            continue;
          }
          // Also we need to check to see whether this point could conceivably be on this ellipse based on its gradient
          let dotcenter = p5.Vector.dot(p5.Vector.sub(center, poi[p].pos).normalize(), p5.Vector.normalize(poi[p].dir));
          if (dotcenter >= cos(PI/4)) {  // about 45 degrees
            let d = p5.Vector.dist(poi[p].pos, center);
            let f = min(p5.Vector.dist(poi[p].pos, poi[p1].pos), p5.Vector.dist(poi[p].pos, poi[p2].pos));  // The paper doesn't give an explicit formula for f
            if (d > semimajor) {
              // These three points can't form an ellipse if p1 and p2 are on the major axis
              continue;
            }
            let costausq = sq((sq(semimajor) + sq(d) - sq(f)) / (2 * semimajor * d)); 
            costausq = constrain(costausq, 0.0, 1.0);  // Sometimes costausq is larger than 1 because of rounding issues
            let sintausq = 1.0 - costausq;  // This isn't explicitly given in the paper but it's a pretty simple identity
            let semiminor = sqrt(abs((sq(semimajor) * sq(d) * sintausq) / (sq(semimajor) - sq(d) * costausq)));
            // sometimes we get incredibly large numbers for the semiminor; that's because p basically can't be on the ellipse
            // If something like this b is already in the accumulator array, accumulate
            // Otherwise, add a new bin with b
            let accumulated = false;
            for (let a = 0; a < accumulator.length; a++) {
              if (abs(accumulator[a][0] - semiminor) < sThresh) {
                accumulator[a][0] = 0.75 * accumulator[a][0] + 0.25 * semiminor;  // center the semiminor value to make it more general
                accumulator[a][1] ++;  // accumulate
                accumulator[a][2].push(p);  // keep track of this point so that we can remove it later
                accumulated = true;
                break;
              }
            }
            if (!accumulated) {
              // We don't have any similar semiminor axis values already; add a new bin to the accumulator
              accumulator.push([semiminor, 1, [p]]);
            }
          }
        }
        // If the max accumulated is sufficient, add this as an ellipse and remove p1, p2, and all p
        let scores = accumulator.map((x) => x[1] / ellipseCircumference(semimajor, x[0]));
        let maxAccum = max(scores);  // this is just reshaping the array so that we can operate on the accumulator values
        push();
        colorMode(HSB, 100);
        stroke(maxAccum * 150,100,100, sq(maxAccum * 128));
        line(poi[p1].pos.x - width/2, poi[p1].pos.y - height/2, poi[p2].pos.x - width/2, poi[p2].pos.y - height/2);
        pop();
        // find the idx of the max value
        let idxMax = scores.indexOf(maxAccum);
        if (maxAccum > binThresh && accumulator[idxMax][1] > minPointsThresh) {
          // Add this ellipse
          let newEllipse = new Ellipse(center, semimajor * 2, accumulator[idxMax][0] * 2, alpha, poi[p1].pos, poi[p2].pos);
          newEllipse.col = createVector(random()*196 + 64, random()*196 + 64, random()*196 + 64);
          ellipses.push(newEllipse);
          // Redraw background to make it look better
          image(viewImage, -width/2, -height/2);
          drawPOI();
          // Remove all the points in this bin
          // This is tricky because we keep track of points based on index
          // Actually, maybe we should just make a new poi list...
          let newpoi = [];
          for (let p = 0; p < poi.length; p++) {
            if (!accumulator[idxMax][2].includes(p) && p != p1 && p != p2) {
              newpoi.push(poi[p]);
            } else {
              newEllipse.thispoi.push(poi[p]);
            }
          }
          poi = newpoi;
          p1 = 0;  // we've changed poi so much that we might as well just start over
          p2 = -1;  // we had ought to do this too
        }
      }
  //  }
  //}
  // The ellipses we've found are already added to ellipses
}
