/*
 * Tactile-JS
 * Copyright 2018 Craig S. Kaplan, csk@uwaterloo.ca
 *
 * Distributed under the terms of the 3-clause BSD license.  See the
 * file "LICENSE" for more information.
 */

function TilerTheCreator(options) {
	let {width, height, zoom, name} = options;
	let edges = [];
	let tilingType = (options.type) ? options.type : 0;
	const tiling = new Tactile.IsohedralTiling( Tactile.tiling_types[ tilingType ] );

	let tile_shape = [];
	//utilities
	const sub = ( V, W ) => { return { x: V.x-W.x, y: V.y-W.y }; };
	const dot = ( V, W ) => { return V.x*W.x + V.y*W.y; };
	const len = ( V ) => { return Math.sqrt( dot( V, V ) ); }
	const ptdist = ( V, W ) => { return len( sub( V, W ) ); }
	const inv = ( T ) => {
		const det = T[0]*T[4] - T[1]*T[3];
		return [T[4]/det, -T[1]/det, (T[1]*T[5]-T[2]*T[4])/det,
			-T[3]/det, T[0]/det, (T[2]*T[3]-T[0]*T[5])/det];
	};
	const normalize = ( V ) => {
		const l = len( V );
		return { x: V.x / l, y: V.y / l };
	};

	const distToSeg = ( P, A, B ) => {
		const qmp = sub( B, A );
		const t = dot( sub( P, A ), qmp ) / dot( qmp, qmp );
		if( (t >= 0.0) && (t <= 1.0) ) {
			return len( sub( P, { x: A.x + t*qmp.x, y : A.y + t*qmp.y } ) );
		} else if( t < 0.0 ) {
			return len( sub( P, A ) );
		} else {
			return len( sub( P, B ) );
		}
	}

	//Default States

    const clearTileShape = () => {
        tile_shape = [];
	}
  
    const clearCurrentEdges = () => {
        edges = [];
	}
	
	//getters
	const getTileType = () => {
        return tilingType;
    }
    const getCurrentEdges = () => {
        return edges;
    }
	const getName = () => {
		return name;
	}

	const getCurrentTiling = () => {
        return tiling;
    }
    const getTileShape = () => {
        return tile_shape;
	}
	
	const getTilingRect = (pts, margin ) => {
		
		const v = normalize( sub( pts[1], pts[0] ) );
		const w = normalize( sub( pts[3], pts[0] ) );
		return [
			{ x: pts[0].x + margin * (-v.x -w.x), y: pts[0].y + margin * (-v.y-w.y) },
			{ x: pts[1].x+margin*(v.x-w.x), y: pts[1].y+margin*(v.y-w.y) },
			{ x: pts[2].x+margin*(v.x+w.x), y: pts[2].y+margin*(v.y+w.y) },
			{ x: pts[3].x+margin*(-v.x+w.x), y: pts[3].y+margin*(-v.y+w.y) } ];
	}

	//setters
	const setNewWidth = (w) => {
		width = w;
	}
	const setNewHeight = (h) => {
		height = h;
	}
	const setNewZoom = (z) => {
		zoom = z;
	}
	
	const setEdges = (insertEdges) => {
		edges = insertEdges;
	}

	const setTilingType = () =>
	{
        
		tiling.reset(Tactile.tiling_types[ tilingType ]);
		params = tiling.getParameters();

		for( let idx = 0; idx < tiling.numEdgeShapes(); ++idx ) {
			ej = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
			edges.push( ej );
		}
	}

	const setNewTilingType = (tile_type) => {
		tilingType = tile_type;
		setTilingType();
	}

	//drawing functions
	const cacheTileShape = (local_tile_shape = []) =>
	{   
		for( let i of tiling.parts() ) {
            const ej = edges[i.id];
			let cur = i.rev ? (ej.length-2) : 1;
			const inc = i.rev ? -1 : 1;

			for( let idx = 0; idx < ej.length - 1; ++idx ) {
				local_tile_shape.push( Tactile.mul( i.T, ej[cur] ) );
				cur += inc;
			}
		}
		tile_shape = local_tile_shape;
	}

	const addToTileShape = () => {
		cacheTileShape(tile_shape);
	}

	const centreRect = ( xmin, ymin, xmax, ymax ) => {
		const sc = Math.min( width / (xmax-xmin), height / (ymax-ymin) );
		return Tactile.mul( 
			[sc, 0.0, 400.0,  0.0, -sc, 300.0],
			[1, 0, -0.5*(xmin+xmax), 0, 1, -0.5*(ymin+ymax)] );
	}


	const nextTilingType = () => {
		if( tilingType < (Tactile.num_types-1) ) {
			tilingType++;
			setTilingType();
		}
	}

	const prevTilingType = () => {
		if( tilingType > 0 ) {
			tilingType--;
			setTilingType();
		}
	}

	const readyToDraw = ()  => {
		const asp = width / height;
		const h = 6.0 * zoom;
		const w = asp * h * zoom;
		const sc = height / (2*h);
		return {M: Tactile.mul(
			[1, 0, width/2.0, 0, 1, height/2.0],
			[sc, 0, 0, 0, -sc, 0] ), w, h, sc, asp}
	}

	const deleteVertex = (edge_at, vertex_at) => {
		edges[edge_at].splice( vertex_at, 1 );
		cacheTileShape();
	}

	return {
		//utilities
		ptdist,
		len,
        inv,
		normalize,
		distToSeg,
		//go to default state
		clearTileShape,
		clearCurrentEdges,
		//getters
		getCurrentEdges,
		getCurrentTiling,
		getName,
		getTileShape,
		getTileType,
		//Setters
		setEdges,
		setNewHeight,
        setNewTilingType,
        setTilingType,
		setNewWidth,
		setNewZoom,
		//drawing functions
		deleteVertex,
		getTilingRect,
		centreRect,
		readyToDraw,
		nextTilingType,
		prevTilingType,
		cacheTileShape,
		addToTileShape
	}

}