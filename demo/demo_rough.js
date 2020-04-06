const setCanvas = () => {
      const roughCanvas = rough.canvas(document.getElementById('roughcanvas'));
      const roughJSTiling = new TilerTheCreator({width: 800, height: 600, zoom: 1, name: "rough", type: 77});
      roughJSTiling.setTilingType();
      roughJSTiling.cacheTileShape();
      const {M, h, w} = roughJSTiling.readyToDraw();
	const tiling = roughJSTiling.getCurrentTiling();
      const tile_shape = roughJSTiling.getTileShape();
	for( let i of tiling.fillRegionBounds( -w-2.0, -h-2.0, w+2.0, h+2.0 ) ) {
		const TT = i.T;
            const T = Tactile.mul( M, TT );
            const polygon = [];
            roughCanvas.polygon(tile_shape);
		for( let v of tile_shape ) {
                  const P = Tactile.mul( T, v );
                  polygon.push([P.x, P.y]);
            }
            roughCanvas.polygon(polygon, {fill: 'red',
            hachureAngle: 60, // angle of hachure,
            hachureGap: 8
      });
		
	}
}
setCanvas();