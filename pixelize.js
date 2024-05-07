class PixelImage {
    constructor(imageObject, canvas) {
        this.originalImg = imageObject;
        this.canvas = canvas;
        this.canvasContext = canvas.getContext('2d');

        this.pixelImg = null;
        this.palette = [
            [255, 255, 255],
            [0, 0, 0],
            [255, 0, 0],
            [0, 255, 0],
            [0, 0, 255],
            [255, 255, 0]
        ];

        console.log('> Image loaded');
        console.log('> Palette set to bwrgby');
    }

    showOriginalImage() {
        const height = this.originalImg.height;
        const width = this.originalImg.width;
        this.canvasContext.drawImage(this.originalImg, 0, 0, width, height);
    }

    showPixelizedImage() {
        if (this.pixelImg == null) {
            console.log("[show error] Call pixelize() first!");
            return;
        }
        const height = this.pixelImg.height;
        const width = this.pixelImg.width;
        this.canvasContext.putImageData(this.pixelImg, 0, 0);
    }

    pixelize(approxMaxSize = 80, method = 'floyd-steinberg') {
        console.log("> Pixelizing...");

        // Get shape & downsampling block size
        const height = this.originalImg.height;
        const width = this.originalImg.width;
        const bs = approxMaxSize ? Math.max(height, width) / approxMaxSize : 1;
        const newHeight = Math.floor(height / bs);
        const newWidth = Math.floor(width / bs);
        console.log("> Block size of ".concat(bs, ", output dimensions: ", newWidth, " x ", newHeight));

        // Downsample by mean-pooling
        console.log("> Downsampling...");
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.canvasContext.drawImage(this.originalImg, 0, 0, newWidth, newHeight);
        var tempImgData = this.canvasContext.getImageData(0, 0, newWidth, newHeight);
        const tempImgArray = new Uint8Array(tempImgData.data);

        // Dithering
        console.log("> Dithering...");
        const tempImgMatrix = convertToImageMatrix(tempImgArray, newHeight, newWidth); // h x w x 3
        if (method == 'floyd-steinberg') {
            var ditheredImg = this.ditheringFloydSteinberg(tempImgMatrix);
        } else if (method == 'atkinson') {
            var ditheredImg = this.ditheringAtkinson(tempImgMatrix);
        } else if (method == 'minimizedaverageerror') {
            var ditheredImg = this.ditheringMAE(tempImgMatrix);
        }

        // Convert to image data
        this.pixelImg = new ImageData(ditheredImg, newWidth, newHeight);
        console.log("> Done!");
    }

    setPalette(palette) {
        this.palette = palette;
    }

    // This function performs dithering to an image dictionary with the following keys:
    //      data: 4D Uint8Array representing pixels' values
    //      shape: array of [height, width, 3]
    ditheringFloydSteinberg(matrixImg) {
        // Initialization
        const h = matrixImg.length;
        const w = matrixImg[0].length;
        const dimg = matrixImg;

        // Floyd-Steinberg algorithm
        for (var ir = 0; ir < h; ir++) {
            for (var ic = 0; ic < w; ic++) {
                const oldPixel = dimg[ir][ic];
                const newPixel = this._findClosestPaletteColor(oldPixel);
                const error = oldPixel.map((val, index) => val - newPixel[index]);
                dimg[ir][ic] = newPixel;
                if (ic + 1 < w) {
                    dimg[ir][ic + 1] = dimg[ir][ic + 1].map((val, index) => val + error[index] * 7 / 16);
                }
                if (ir + 1 < h) {
                    if (ic > 0) {
                        dimg[ir + 1][ic - 1] = dimg[ir + 1][ic - 1].map((val, index) => val + error[index] * 3 / 16);
                    }
                    dimg[ir + 1][ic] = dimg[ir + 1][ic].map((val, index) => val + error[index] * 5 / 16);
                    if (ic + 1 < w) {
                        dimg[ir + 1][ic + 1] = dimg[ir + 1][ic + 1].map((val, index) => val + error[index] / 16);
                    }
                }
            }
        }
        return convertToImageArray(dimg);
    }

    ditheringAtkinson(matrixImg) {
        // Initialization
        const h = matrixImg.length;
        const w = matrixImg[0].length;
        const dimg = matrixImg;

        // Atkinson algorithm
        for (var ir = 0; ir < h; ir++) {
            for (var ic = 0; ic < w; ic++) {
                const oldPixel = dimg[ir][ic];
                const newPixel = this._findClosestPaletteColor(oldPixel);
                const error = oldPixel.map((val, index) => val - newPixel[index]);
                dimg[ir][ic] = newPixel;
                if (ic + 1 < w) {
                    dimg[ir][ic + 1] = dimg[ir][ic + 1].map((val, index) => val + error[index] / 8);
                    if (ic + 2 < w) {
                        dimg[ir][ic + 2] = dimg[ir][ic + 2].map((val, index) => val + error[index] / 8);
                    }
                }
                if (ir + 1 < h) {
                    if (ic > 0) {
                        dimg[ir + 1][ic - 1] = dimg[ir + 1][ic - 1].map((val, index) => val + error[index] / 8);
                    }
                    dimg[ir + 1][ic] = dimg[ir + 1][ic].map((val, index) => val + error[index] / 8);
                    if (ic + 1 < w) {
                        dimg[ir + 1][ic + 1] = dimg[ir + 1][ic + 1].map((val, index) => val + error[index] / 8);
                    }
                    if (ir + 2 < h) {
                        dimg[ir + 2][ic] = dimg[ir + 2][ic].map((val, index) => val + error[index] / 8);
                    }
                }
            }
        }
        return convertToImageArray(dimg);
    }

    ditheringMAE(matrixImg) {
        // Initialization
        const h = matrixImg.length;
        const w = matrixImg[0].length;
        const dimg = matrixImg;

        // Minimized Average Error algorithm
        for (var ir = 0; ir < h; ir++) {
            for (var ic = 0; ic < w; ic++) {
                const oldPixel = dimg[ir][ic];
                const newPixel = this._findClosestPaletteColor(oldPixel);
                const error = oldPixel.map((val, index) => val - newPixel[index]);
                dimg[ir][ic] = newPixel;
                // Current row
                if (ic + 1 < w) {
                    dimg[ir][ic + 1] = dimg[ir][ic + 1].map((val, index) => val + error[index] * 7 / 48);
                    if (ic + 2 < w) {
                        dimg[ir][ic + 2] = dimg[ir][ic + 2].map((val, index) => val + error[index] * 5 / 48);
                    }
                }
                // Next row
                if (ir + 1 < h) {
                    if (ic > 0)
                        dimg[ir + 1][ic - 1] = dimg[ir + 1][ic - 1].map((val, index) => val + error[index] * 5 / 48);
                    if (ic > 1)
                        dimg[ir + 1][ic - 2] = dimg[ir + 1][ic - 2].map((val, index) => val + error[index] * 3 / 48);
                    dimg[ir + 1][ic] = dimg[ir + 1][ic].map((val, index) => val + error[index] * 7 / 48);
                    if (ic + 1 < w)
                        dimg[ir + 1][ic + 1] = dimg[ir + 1][ic + 1].map((val, index) => val + error[index] * 5 / 48);
                    if (ic + 2 < w)
                        dimg[ir + 1][ic + 2] = dimg[ir + 1][ic + 2].map((val, index) => val + error[index] * 3 / 48);
                }
                // Next+1 row
                if (ir + 2 < h) {
                    if (ic > 0)
                        dimg[ir + 2][ic - 1] = dimg[ir + 2][ic - 1].map((val, index) => val + error[index] * 3 / 48);
                    if (ic > 1)
                        dimg[ir + 2][ic - 2] = dimg[ir + 2][ic - 2].map((val, index) => val + error[index] * 1 / 48);
                    dimg[ir + 2][ic] = dimg[ir + 2][ic].map((val, index) => val + error[index] * 5 / 48);
                    if (ic + 1 < w)
                        dimg[ir + 2][ic + 1] = dimg[ir + 2][ic + 1].map((val, index) => val + error[index] * 3 / 48);
                    if (ic + 2 < w)
                        dimg[ir + 2][ic + 2] = dimg[ir + 2][ic + 2].map((val, index) => val + error[index] * 1 / 48);
                }
            }
        }
        return convertToImageArray(dimg);
    }

    _findClosestPaletteColor(pixel) {
        let minDist = Number.MAX_VALUE;
        let closestColor = [];
        for (const color of this.palette) {
            const dist = Math.sqrt(color.reduce((acc, val, index) => acc + Math.pow(val - pixel[index], 2), 0));
            if (dist < minDist) {
                minDist = dist;
                closestColor = color;
            }
        }
        return closestColor;
    }
}

function convertToImageMatrix(flattenedArr, newHeight, newWidth) {
    // flattenedArr with dimensions [1 x w*h*4], 4D representing RGBA (0-255)
    // returns array with dimensions [h x w x 3] (ignoring alpha channel)
    if (newWidth * newHeight * 4 != flattenedArr.length) {
        console.log("[error in convertToImageMatrix()] Dimensions does not match!");
        console.log("width: ".concat(newWidth, ", height: ", newHeight, ", array dims: ", flattenedArr.length));
        return;
    }
    var index = 0;
    let reshapedArray = [];
    for (var h = 0; h < newHeight; h++) {
        let row = [];
        for (var w = 0; w < newWidth; w++) {
            let pixel = [];
            for (var k = 0; k < 3; k++) {
                pixel.push(flattenedArr[index]);
                index++;
            }
            index++;
            row.push(pixel);
        }
        reshapedArray.push(row);
    }
    return reshapedArray;
}

function convertToImageArray(arr) {
    // array with dimensions [h x w x 3] (ignoring alpha channel)
    // returns flattened array with dimensions [1 x w*h*4], 4D representing RGBA (0-255)
    const width = arr.length;
    const height = arr[0].length;
    var imgArray = new Array(width * height * 4);
    var counter = 0;
    for (var i = 0; i < width; i++) {
        for (var j = 0; j < height; j++) {
            for (var k = 0; k < 3; k++) {
                imgArray[counter] = arr[i][j][k];
                counter++;
            }
            imgArray[counter] = 255;
            counter++;
        }
    }
    return Uint8ClampedArray.from(imgArray);
}