// DEV ONLY. Bake the imported production grid recipe and shell into one model.
// The isolated pad has base Z=0. Source normalized wall heights still use the
// authored game canvas height, never the preview's current display resolution.
var StructureModel = (function () {
  var repeats = 32;

  function requireNumber(value, fallback, min, max, name, integer) {
    if (value === undefined) return fallback;
    if (!Number.isFinite(value) || value < min || value > max || (integer && value !== Math.floor(value))) {
      throw new Error('Invalid structure ' + name);
    }
    return value;
  }

  function descriptorFor(options) {
    options = options || {};
    var type = options.type || 'fortress';
    if (['fortress', 'arena', 'watchtower'].indexOf(type) < 0) throw new Error('Invalid structure type');
    return {
      type:type, x:0, y:0, centerWX:0, centerWY:0,
      scale:requireNumber(options.scale, 1, 0.85, 1.15, 'scale'),
      rotation:requireNumber(options.rotation, 0, -Math.PI * 2, Math.PI * 2, 'rotation'),
      numBuildings:requireNumber(options.numBuildings, 2, 0, 2, 'numBuildings', true),
      numPillars:requireNumber(options.numPillars, 12, 8, 15, 'numPillars', true),
      armCount:requireNumber(options.armCount, 3, 2, 4, 'armCount', true),
      palette:StructureProduction.defaultPalette(type)
    };
  }

  function cssColor(packed) {
    return '#' + (0x1000000 | packed).toString(16).slice(1);
  }

  // UV phase is tied to model-space distance, including across merged cells.
  // Non-axis shell faces use an orthonormal in-plane frame, not a stretched box.
  function texturedFace(points, material, color, kind) {
    var first = points[0], second = points[1], third = points[2];
    var ex=second.x-first.x, ey=second.y-first.y, ez=second.z-first.z;
    var fx=third.x-first.x, fy=third.y-first.y, fz=third.z-first.z;
    var nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx;
    var el=Math.hypot(ex,ey,ez), nl=Math.hypot(nx,ny,nz);
    if (!(el > 0 && nl > 0)) throw new Error('Degenerate structure face');
    var ux=ex/el, uy=ey/el, uz=ez/el;
    var vx=(ny*uz-nz*uy)/nl, vy=(nz*ux-nx*uz)/nl, vz=(nx*uy-ny*ux)/nl;
    var verticalX = Math.abs(nx) > nl * (1-1e-10);
    var verticalY = Math.abs(ny) > nl * (1-1e-10);
    var horizontal = Math.abs(nz) > nl * (1-1e-10);
    return {vertices:points.map(function (p) {
      var u, v;
      if (horizontal) { u=p.x/repeats; v=p.y/repeats; }
      else if (verticalX) { u=p.y/repeats; v=-p.z/repeats; }
      else if (verticalY) { u=p.x/repeats; v=-p.z/repeats; }
      else { u=(p.x*ux+p.y*uy+p.z*uz)/repeats; v=(p.x*vx+p.y*vy+p.z*vz)/repeats; }
      return {x:p.x,y:p.y,z:p.z,u:u,v:v};
    }), material:material, color:color, light:1, kind:kind};
  }

  // A geometric boundary mesh of the sampled solid columns. Adjacent equal
  // columns have no internal faces; a lower neighbor exposes only the riser.
  // Returns {faces,stats}; exported for authored cavity/step regression fixtures.
  function meshGrid(grid) {
    var width=grid.width, height=grid.height, cell=grid.cell;
    var count=width*height, solid=grid.solid, heights=grid.wallHeights, colors=grid.colors || grid.color;
    var baseH=StructureProduction.constants.canvasBaseH;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        count > 262144 || !Number.isFinite(cell) || cell <= 0 ||
        !Number.isInteger(grid.minCellX) || !Number.isInteger(grid.minCellY) ||
        !solid || solid.length !== count || !heights || heights.length !== count || !colors || colors.length !== count) {
      throw new Error('Invalid structure grid');
    }
    var faces=[], groups=Object.create(null), visited=new Uint8Array(count);
    var rawFaces=0, solidCells=0;
    function zAt(x,y) {
      if (x<0 || y<0 || x>=width || y>=height) return 0;
      var index=y*width+x;
      return solid[index] ? heights[index]*baseH : 0;
    }
    function edge(direction, plane, start, z0, z1, color) {
      if (!(z1>z0)) return;
      var key=[direction,plane,z0,z1,color].join('|');
      if (!groups[key]) groups[key]={direction:direction,plane:plane,z0:z0,z1:z1,color:color,starts:[]};
      groups[key].starts.push(start); rawFaces++;
    }
    for (var y=0;y<height;y++) for (var x=0;x<width;x++) {
      var i=y*width+x;
      if (!solid[i]) continue;
      if (!(Number.isFinite(heights[i]) && heights[i]>0)) throw new Error('Invalid solid column height');
      solidCells++;
      var z1=heights[i]*baseH, color=colors[i], wx=(grid.minCellX+x)*cell, wy=(grid.minCellY+y)*cell;
      edge('W',wx,wy,zAt(x-1,y),z1,color);
      edge('E',wx+cell,wy,zAt(x+1,y),z1,color);
      edge('N',wy,wx,zAt(x,y-1),z1,color);
      edge('S',wy+cell,wx,zAt(x,y+1),z1,color);
      rawFaces++;
      if (visited[i]) continue;
      var run=1, rows=1;
      function matching(px,py) {
        var n=py*width+px;
        return solid[n] && !visited[n] && heights[n]===heights[i] && colors[n]===color;
      }
      while (x+run<width && matching(x+run,y)) run++;
      var extend=true;
      while (y+rows<height && extend) {
        for (var xx=0;xx<run;xx++) if (!matching(x+xx,y+rows)) { extend=false; break; }
        if (extend) rows++;
      }
      for (var yy=0;yy<rows;yy++) for (var xx2=0;xx2<run;xx2++) visited[(y+yy)*width+x+xx2]=1;
      faces.push(texturedFace([
        {x:wx,y:wy,z:z1},{x:wx+run*cell,y:wy,z:z1},
        {x:wx+run*cell,y:wy+rows*cell,z:z1},{x:wx,y:wy+rows*cell,z:z1}
      ],'stone',cssColor(color),'top'));
    }
    Object.keys(groups).sort().forEach(function (key) {
      var g=groups[key], starts=g.starts.sort(function (a,b) { return a-b; });
      for (var s=0;s<starts.length;) {
        var begin=starts[s], end=begin+cell;
        s++;
        while (s<starts.length && starts[s]===end) { end+=cell; s++; }
        var a,b;
        if (g.direction==='W') { a={x:g.plane,y:end}; b={x:g.plane,y:begin}; }
        else if (g.direction==='E') { a={x:g.plane,y:begin}; b={x:g.plane,y:end}; }
        else if (g.direction==='N') { a={x:begin,y:g.plane}; b={x:end,y:g.plane}; }
        else { a={x:end,y:g.plane}; b={x:begin,y:g.plane}; }
        faces.push(texturedFace([
          {x:a.x,y:a.y,z:g.z0},{x:b.x,y:b.y,z:g.z0},
          {x:b.x,y:b.y,z:g.z1},{x:a.x,y:a.y,z:g.z1}
        ],'stone',cssColor(g.color),'wall'));
      }
    });
    return {faces:faces,stats:{solidCells:solidCells,unmergedBodyFaces:rawFaces,bodyFaces:faces.length}};
  }

  function getBounds(faces) {
    var bounds={minX:Infinity,minY:Infinity,minZ:Infinity,maxX:-Infinity,maxY:-Infinity,maxZ:-Infinity};
    faces.forEach(function (face) { face.vertices.forEach(function (p) {
      bounds.minX=Math.min(bounds.minX,p.x); bounds.maxX=Math.max(bounds.maxX,p.x);
      bounds.minY=Math.min(bounds.minY,p.y); bounds.maxY=Math.max(bounds.maxY,p.y);
      bounds.minZ=Math.min(bounds.minZ,p.z); bounds.maxZ=Math.max(bounds.maxZ,p.z);
    }); });
    return bounds;
  }

  function build(options) {
    var started=typeof performance==='object' ? performance.now() : Date.now();
    var st=descriptorFor(options), constants=StructureProduction.constants;
    // This is a conservative generation envelope, not a redesigned footprint.
    var chunksEachSide=Math.ceil(constants.chunkSize*1.8*st.scale/constants.chunkSize);
    var width=chunksEachSide*2*constants.chunkCells, n=width*width;
    var grid={width:width,height:width,cell:constants.cell,minCellX:-chunksEachSide*constants.chunkCells,
      minCellY:-chunksEachSide*constants.chunkCells,solid:new Uint8Array(n),
      wallHeights:new Float32Array(n),colors:new Uint32Array(n)};
    for (var cy=-chunksEachSide;cy<chunksEachSide;cy++) for (var cx=-chunksEachSide;cx<chunksEachSide;cx++) {
      var chunk=StructureProduction.stamp(st,cx,cy);
      for (var y=0;y<constants.chunkCells;y++) for (var x=0;x<constants.chunkCells;x++) {
        var source=y*constants.chunkCells+x;
        var dest=((cy+chunksEachSide)*constants.chunkCells+y)*width+(cx+chunksEachSide)*constants.chunkCells+x;
        grid.solid[dest]=chunk.grid[source]; grid.wallHeights[dest]=chunk.wallHeights[source];
        grid.colors[dest]=(chunk.wallColorR[source]<<16)|(chunk.wallColorG[source]<<8)|chunk.wallColorB[source];
      }
    }
    var mesh=meshGrid(grid), faces=mesh.faces, shell=StructureProduction.captureShell(st);
    var woods=Object.keys(StructureProduction.woodColors).map(function (key) { return StructureProduction.woodColors[key]; });
    shell.forEach(function (face) {
      var material=woods.indexOf(face.color)>=0 ? 'wood' :
        ['#b58a35','#9f3d2d','#3f7597'].indexOf(face.color)>=0 ? null : 'stone';
      faces.push(texturedFace(face.vertices,material,face.color,'shell'));
    });
    var bodyBounds=getBounds(faces), pad=constants.cell*4;
    var x0=bodyBounds.minX-pad,y0=bodyBounds.minY-pad,x1=bodyBounds.maxX+pad,y1=bodyBounds.maxY+pad;
    faces.push(texturedFace([{x:x0,y:y0,z:0},{x:x1,y:y0,z:0},{x:x1,y:y1,z:0},{x:x0,y:y1,z:0}],
      'stone',cssColor((st.palette.f[0]<<16)|(st.palette.f[1]<<8)|st.palette.f[2]),'floor'));
    var stats=mesh.stats;
    stats.gridCells=n; stats.shellFaces=shell.length; stats.floorFaces=1; stats.faces=faces.length;
    stats.mergedSavings=stats.unmergedBodyFaces-stats.bodyFaces;
    stats.buildMs=(typeof performance==='object' ? performance.now() : Date.now())-started;
    return {faces:faces,bounds:getBounds(faces),bodyBounds:bodyBounds,stats:stats,descriptor:st,grid:grid,
      provenance:{body:'05-endless-world.js: production structure stamp',shell:'15-render-hud-menu.js: production structure shell',
        floor:'isolated flat test pad, not generated terrain',uvWorldUnitsPerRepeat:repeats}};
  }

  return Object.freeze({build:build,meshGrid:meshGrid});
}());
