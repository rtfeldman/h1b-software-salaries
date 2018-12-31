
// TERMINOLOGY
//
// dv = "DataView"
// waddr = "word address"
// baddr = "byte address"


function logBytes(highlights, bytes) {
  let dv = new DataView(bytes);
  let str = "\n\x1B[7m                                                                                                                                           \n           " +
      [0, 1,2,3,4,5,6,7].map((num) => { return "    " + num + "    "; }).join("   ") +
      "                                   \n                   " +
    [0,1,2,3,4,5,6,7].map((num) => { return "         "; }).join("   ") +
    "                           ";

  for (let i=0; i < bytes.byteLength; i++) {
    if (i % 8 === 0) {
      str += "\n\x1B[7m";
      str += "        \u001b[0m                                                                                                   \x1B[7m                                \n";
      // str += ((i + 1).toString() + " - " + (i + 8).toString() + "  ").padStart(16, ' ');
      str += ((i / 8).toString() + "  ").padStart(8, ' ');
      str += "\u001b[0m";
      str += "   ";
    } 

    const byteStr = dv.getUint8(i).toString(2).padStart(8, '0');
    let highlight = {first: "", second: ""};

    if (i < 8) {
      highlight.first = "\u001b[31m";
      highlight.second = highlight.first;
    } else if (i % 8 < 4) {
      highlight.first = "\u001b[32m";
      highlight.second = "\u001b[32m";
    } else {
      highlight.first = "\u001b[36m";
      highlight.second = "\u001b[36m";
    }

    str += highlight.first + byteStr.slice(0, 4);

    str += " ";

    str += highlight.second + byteStr.slice(-4);

    str += "\u001b[0m   ";

    if (i % 8 === 7) {
      str += "\x1B[7m  ";
      try {
        const u32one = dv.getUint32(i - 7, true);
        const u32two = dv.getUint32(i - 7 + 4, true);

        // str += (((i - 7) / 8) + 1).toString().padEnd(8, ' ');
        str += (u32one + " • " + u32two).padEnd(30, ' ');
      } catch (err) {
        str += "".padEnd(30, ' ');
      } finally {
        str += "\u001b[0m";
      }
    } 
  }

  return str;
}


function decode(bytes) {
  var dv = new DataView(bytes);
  var release = dv.getUint32(0, true);
  var variantType = dv.getUint16(4, true);

  switch (variantType) {
    case 0x1: // Topology
      var ptable = dv.getUint16(6, true);

      return decodeTopology(dv, 8, ptable);
  }

  decodingError(bytes, "I couldn't decode this unknown variant type: " + variantType);
}

function decodeTopology(dv, addr, ptable) {
  // TODO check if ptable is missing any required entries
  
  return {
    type: "Topology",
    objects: decodeObjects(dv, addr),
    arcs: decodeArray(dv, addr + 8, 8,
      (dv, baddr) => {
        return decodeArray(dv, baddr, 4,
          (dv, baddr) => { return dv.getUint32(baddr, true); }
        );
      }
    ),
    transform: decodeTransform(dv, addr + 16)
  };
}

function decodeObjects(dv, addr) {
  return dv.getFloat64(addr, true);
  var objAddr = dv.getUint32(addr, true);
  var ptable = dv.getUint32(addr + 4, true);

  // TODO check if ptable is missing any required entries
  
// record Objects
//     * counties : GeometryCollection
//     * states : GeometryCollection
//     * land : Geometry
}

function decodeTransform(dv, addr) {
  var ptrAddr = dv.getUint32(addr, true);
  var ptable = dv.getUint32(addr + 4, true);

  // TODO check if ptable is missing any required entries
  
  return {
    scale: [
      dv.getFloat64(ptrAddr * 8, true),
      dv.getFloat64((ptrAddr + 1) * 8, true),
    ],
    translate: [
      dv.getFloat64((ptrAddr + 2) * 8, true),
      dv.getFloat64((ptrAddr + 3) * 8, true),
    ]
  };
}

function decodeArray(dv, baddr, elemSize, decodeElem) {
  const ptrWaddr = dv.getUint32(baddr, true);
  const len = dv.getUint32(baddr + 4, true);
  
  if (len === 0) {
    if (ptrWaddr === 0) {
      // empty collection; nothing to look up!
      return [];
    }

    throw "TODO handle superlong pointers.";
  } else {
    // Since length > 0 && address > 0, this is a normal pointer - look it up!
    const ptrBaddr = ptrWaddr * 8;
    let arr = new Array(len);

    for (var i=0; i < len; i++) {
      arr[i] = decodeElem(dv, ptrBaddr + (i * elemSize));
    }

    return arr;
  }
}

function encode(data) {
  var bytes = new ArrayBuffer(195); // TODO dynamic allocation
  var dv = new DataView(bytes);
  
  switch (data.type) {
    case "Topology":
      dv.setUint32(0, 1, true); // This is Release #1
      dv.setUint16(4, 0x1, true); // 0x1 is the "Topology" variant
      dv.setUint16(6, 0x111, true); // The "Topoloy" variant holds a record; this is its ptable
      
      encodeRecord(dv, 8, 1, [
        (dv, baddr, nextFreeWaddr) => { return encodeFloat64(dv, baddr, nextFreeWaddr, data.objects); },
        (dv, baddr, nextFreeWaddr) => {
          // Leave it at all 0s if it's an empty collection.
          if (data.arcs.length === 0) {
            return nextFreeWaddr;
          } 

          encodeArrayPtr(dv, baddr, nextFreeWaddr, data.arcs.length);

          return encodeArray(dv, nextFreeWaddr, 8, data.arcs,
            (dv, baddr, nextFreeWaddr, subarray) => {
              // Leave it at all 0s if it's an empty collection.
              if (subarray.length === 0) {
                return nextFreeWaddr;
              } 

              encodeArrayPtr(dv, baddr, nextFreeWaddr, subarray.length);

              return encodeArray(dv, nextFreeWaddr, 4, subarray,
                (dv, baddr, nextFreeWaddr, val) => {
                  dv.setUint32(baddr, val, true);

                  return nextFreeWaddr;
                }
              );
            }
          );
        },
        (dv, baddr, nextFreeWaddr) => { return encodeTransform(dv, baddr, nextFreeWaddr, data.transform); },
      ]);

      return dv.buffer;
  }

  encodingError(data, "I couldn't encode this unknown variant type: " + data.type);
}

function encodeArray(dv, waddr, elemSize, arr, encodeElem) {
  // Skip past the addresses we're about to use up with the elements.
  // Round to the nearest word, for word alignment.
  let nextFreeWaddr = waddr + Math.ceil((arr.length * elemSize) / 8);

  for (let i=0; i < arr.length; i++) {
    nextFreeWaddr = encodeElem(dv, (waddr * 8) + (i * elemSize), nextFreeWaddr, arr[i]);
  }

  return nextFreeWaddr;
}

function encodeArrayPtr(dv, ptrByteAddr, destWaddr, length) {
  dv.setUint32(ptrByteAddr, destWaddr, true);
  dv.setUint32(ptrByteAddr + 4, length, true);
}

function encodeRecord(dv, baddr, nextFreeWaddr, encoders) {
  nextFreeWaddr += encoders.length; // Advance past this record's N fields

  for (var i=0; i < encoders.length; i++) {
    nextFreeWaddr = encoders[i](dv, baddr + (i * 8), nextFreeWaddr); 
  }

  return nextFreeWaddr;
}

function encodeFloat64(dv, baddr, nextFreeWaddr, val) {
  dv.setFloat64(baddr, val, true);

  return nextFreeWaddr;
}

function encodeTransform(dv, addr, nextAddr, transform) {
  dv.setUint32(addr, nextAddr, true);
  dv.setUint32(addr + 4, 0x1111, true); // presence table for Transform record

  dv.setFloat64(nextAddr++ * 8, transform.scale[0], true);
  dv.setFloat64(nextAddr++ * 8, transform.scale[1], true);
  dv.setFloat64(nextAddr++ * 8, transform.translate[0], true);
  dv.setFloat64(nextAddr++ * 8, transform.translate[1], true);
 
  return nextAddr;
}

function encodeInt32Array(dv, addr, nextAddr, ints) {
  // Leave it at all 0s if it's an empty collection.
  if (ints.length !== 0) {
    dv.setUint32(addr, nextAddr, true);
    dv.setUint32(addr + 4, ints.length, true);

    for (var i=0; i < ints.length; i++) {
      dv.setUint32((nextAddr++ * 8), ints[i], true);
    }
  }

  return nextAddr;
}

function encodingError(data, msg) {
  throw msg;
}

function decodingError(data, msg) {
  throw msg;
}

function verify(data) {
  // TODO time this step
  var jsonEncoded = JSON.stringify(data);

  // TODO time this step
  var binaryEncoded = encode(data);

  // TODO time this step
  var decoded = decode(binaryEncoded);

  // TODO time this step
  var jsonDecoded = JSON.parse(jsonEncoded);

  if (JSON.stringify(decoded) === jsonEncoded) {
    console.log("Success!");
    console.log("binary data size:", binaryEncoded.byteLength);
    console.log("JSON string size:", JSON.stringify(jsonDecoded).length);
    return true;
  } else {
    console.log("Failed! Expected:\n\n", jsonEncoded, "\n\n", "but got:\n\n", JSON.stringify(decoded), "\n\n");

    console.log("Raw Bytes:\n");
    console.log(logBytes(highlights, binaryEncoded));

    return false;
  }
}

const highlights = {

};

// TODO read this from us.json
var rawData = {
  type: "Topology",
  objects: 1.2,
  arcs: [[1], [2, 3], [44, 55, 66], [], [77]],
  transform: {scale: [ 5, 6 ], translate: [ 7.2, 8.3 ]}
};

verify(rawData);
