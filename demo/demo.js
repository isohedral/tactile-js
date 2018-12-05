/*
 * Tactile-JS
 * Copyright 2018 Craig S. Kaplan, csk@uwaterloo.ca
 *
 * Distributed under the terms of the 3-clause BSD license.  See the
 * file "LICENSE" for more information.
 */

// A port of the Tactile C++ demo program to P5.js.

let QS = null;

let the_type = null;
let params = null;
let tiling = null;
let edges = null;
let tile_shape = null;

const editor_x = 10;
const editor_y = 350;
const editor_w = 200;
const editor_h = 240;

let editor_T;
let dragging = false;
let drag_edge_shape = -1;
let drag_vertex = -1;
let drag_T = null;
let u_constrain = false;

let editor_pane = null;
let show_controls = true;
let zoom = 1.0;

const COLS = [
	[ 25, 52, 65 ],
	[ 62, 96, 111 ],
	[ 145, 170, 157 ],
	[ 209, 219, 189 ],
	[ 252, 255, 245 ],
	[ 219, 188, 209 ] ];

function sub( V, W ) { return { x: V.x-W.x, y: V.y-W.y }; };
function dot( V, W ) { return V.x*W.x + V.y*W.y; };
function len( V ) { return sqrt( dot( V, V ) ); }
function ptdist( V, W ) { return len( sub( V, W ) ); }
function inv( T ) {
	const det = T[0]*T[4] - T[1]*T[3];
	return [T[4]/det, -T[1]/det, (T[1]*T[5]-T[2]*T[4])/det,
		-T[3]/det, T[0]/det, (T[2]*T[3]-T[0]*T[5])/det];
};

function cacheTileShape()
{
	tile_shape = [];

	for( let i of tiling.parts() ) {
		const ej = edges[i.id];
		let cur = i.rev ? (ej.length-2) : 1;
		const inc = i.rev ? -1 : 1;

		for( let idx = 0; idx < ej.length - 1; ++idx ) {
			tile_shape.push( Tactile.mul( i.T, ej[cur] ) );
			cur += inc;
		}
	}
}

function setTilingType()
{
	const tp = Tactile.tiling_types[ the_type ];
	tiling.reset( tp );
	params = tiling.getParameters();

	edges = [];
	for( let idx = 0; idx < tiling.numEdgeShapes(); ++idx ) {
		ej = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
		edges.push( ej );
	}

	cacheTileShape();
	calcEditorTransform();

	title = "Tiling: IH";
	if( tp < 10 ) {
		title += "0";
	}
	title += tp;

	// I'd like to say this: QS.setTitle( title );
	// QuickSettings doesn't include a public API for setting the
	// title of a panel, so reach into the guts and twiddle the
	// data directly.
	QS._titleBar.textContent = title;

	const np = tiling.numParameters();
	let vals = {};
	for( let idx = 0; idx < 6; ++idx ) {
		if( idx < np ) {
			QS.showControl( "v" + idx );
			vals["v"+idx] = params[idx];
		} else {
			QS.hideControl( "v" + idx );
		}
	}
	QS.setValuesFromJSON( vals );
}

function nextTilingType()
{
	if( the_type < (Tactile.num_types-1) ) {
		the_type++;
		setTilingType();
	}
}

function prevTilingType()
{
	if( the_type > 0 ) {
		the_type--;
		setTilingType();
	}
}

function centreRect( xmin, ymin, xmax, ymax )
{
	const sc = Math.min( width / (xmax-xmin), height / (ymax-ymin) );
	return Tactile.mul( 
		[sc, 0.0, 400.0,  0.0, -sc, 300.0],
		[1, 0, -0.5*(xmin+xmax), 0, 1, -0.5*(ymin+ymax)] );
}

function drawTiling()
{
	const asp = width / height;
	const h = 6.0 * zoom;
	const w = asp * h * zoom;
	const sc = height / (2*h);
	const M = Tactile.mul(
		[1, 0, width/2.0, 0, 1, height/2.0],
		[sc, 0, 0, 0, -sc, 0] );

	stroke( COLS[0][0], COLS[0][1], COLS[0][2] );
	strokeWeight( 1.0 );

	for( let i of tiling.fillRegionBounds( -w-2.0, -h-2.0, w+2.0, h+2.0 ) ) {
		const TT = i.T;
		const T = Tactile.mul( M, TT );

		const col = COLS[ tiling.getColour( i.t1, i.t2, i.aspect ) + 1 ];
		fill( col[0], col[1], col[2] );

		beginShape();
		for( let v of tile_shape ) {
			const P = Tactile.mul( T, v );
			vertex( P.x, P.y );
		}
		endShape( CLOSE );
	}
}

function calcEditorTransform()
{
	let xmin = 1e7;
	let xmax = -1e7;
	let ymin = 1e7;
	let ymax = -1e7;

	for( let v of tile_shape ) {
		xmin = Math.min( xmin, v.x );
		xmax = Math.max( xmax, v.x );
		ymin = Math.min( ymin, v.y );
		ymax = Math.max( ymax, v.y );
	}

	const sc = Math.min( 
		(editor_w-50) / (xmax-xmin), (editor_h-50) / (ymax-ymin) );

	editor_transform = Tactile.mul( 
		[sc, 0, 0.5*editor_w, 0, -sc, 0.5*editor_h],
		[1, 0, -0.5*(xmin+xmax), 0, 1, -0.5*(ymin+ymax)] );
}

function distToSeg( P, A, B )
{
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

function drawEditor()
{
	let pg = editor_pane;
	pg.clear();

	pg.fill( 252, 255, 254, 220 );
	pg.noStroke();
	pg.rect( 0, 0, editor_w, editor_h );

	pg.strokeWeight( 2.0 );
	pg.fill( COLS[3][0], COLS[3][1], COLS[3][2] );

	pg.beginShape();
	for( let v of tile_shape ) {
		const P = Tactile.mul( editor_transform, v );
		pg.vertex( P.x, P.y );
	}
	pg.endShape( CLOSE );

	pg.noFill();

	// Draw edges
	for( let i of tiling.parts() ) {
		if( i.shape == Tactile.I ) {
			pg.stroke( 158 );
		} else {
			pg.stroke( 0 );
		}

		const M = Tactile.mul( editor_transform, i.T );
		pg.beginShape();
		for( let v of edges[i.id] ) {
			const P = Tactile.mul( M, v );
			pg.vertex( P.x, P.y );
		}
		pg.endShape();
	}

	// Draw tiling vertices
	pg.noStroke();
	pg.fill( 158 );
	for( let v of tiling.vertices() ) {
		const pt = Tactile.mul( editor_transform, v );
		pg.ellipse( pt.x, pt.y, 10.0, 10.0 );
	}

	// Draw editable vertices
	for( let i of tiling.parts() ) {
		const shp = i.shape;
		const id = i.id;
		const ej = edges[id];
		const T = Tactile.mul( editor_transform, i.T );

		for( let idx = 1; idx < ej.length - 1; ++idx ) {
			pg.fill( 0 );
			const pt = Tactile.mul( T, ej[idx] );
			pg.ellipse( pt.x, pt.y, 10.0, 10.0 );
		}

		if( shp == Tactile.I || shp == Tactile.J ) {
			continue;
		}

		// Draw symmetry points for U and S edges.
		if( !i.second ) {
			if( shp == Tactile.U ) {
				pg.fill( COLS[2][0], COLS[2][1], COLS[2][2] );
			} else {
				pg.fill( COLS[5][0], COLS[5][1], COLS[5][2] );
			}
			const pt = Tactile.mul( T, ej[ej.length-1] );
			pg.ellipse( pt.x, pt.y, 10.0, 10.0 );
		}
	}

	image( pg, editor_x, editor_y );

	strokeWeight( 3.0 );
	stroke( 25, 52, 65, 220 );
	noFill();
	rect( editor_x, editor_y, editor_w, editor_h );
}

function mouseDragged()
{
	if( dragging ) {
		const npt = Tactile.mul( drag_T, 
			{ x: mouseX - editor_x, y: mouseY - editor_y } );
		if( u_constrain ) {
			npt.x = 1.0;
		}

		edges[drag_edge_shape][drag_vertex] = npt;
		cacheTileShape();
		loop();

		return false;
	}
}

function slide()
{
	params = []
	vals = QS.getValuesAsJSON();
	for( let idx = 0; idx < tiling.numParameters(); ++idx ) {
		params.push( vals[ "v" + idx ] );
	}
	tiling.setParameters( params );
	cacheTileShape();
	loop();
}

function mousePressed()
{
	dragging = false;
	if( !show_controls ) {
		return;
	}

	const pt = { x: mouseX - editor_x, y: mouseY - editor_y };
	const del = keyIsDown( SHIFT );

	if( (pt.x < 0) || (pt.x > editor_w) ) {
		return;
	}
	if( (pt.y < 0) || (pt.y > editor_h) ) {
		return;
	}

	for( let i of tiling.parts() ) {
		const shp = i.shape;

		if( shp == Tactile.I ) {
			continue;
		}

		const id = i.id;
		let ej = edges[id];
		const T = Tactile.mul( editor_transform, i.T );
		let P = Tactile.mul( T, ej[0] );

		for( let idx = 1; idx < ej.length; ++idx ) {
			let Q = Tactile.mul( T, ej[idx] );
			if( ptdist( Q, pt ) < 7 ) {
				u_constrain = false;
				if( !del && (idx == (ej.length-1)) ) {
					if( shp == Tactile.U && !i.second ) {
						u_constrain = true;
					} else {
						break;
					}
				}
				if( del ) {
					if( idx < ej.length-1 ) {
						ej.splice( idx, 1 );
						cacheTileShape();
						loop();
					}
					return;
				} else {
					dragging = true;
					drag_edge_shape = id;
					drag_vertex = idx;
					drag_T = inv( T );
					loop();
					return;
				}
			}
			if( del ) {
				continue;
			}

			// Check segment
			if( distToSeg( pt, P, Q ) < 7 ) {
				dragging = true;
				drag_edge_shape = id;
				drag_vertex = idx;
				drag_T = inv( T );
				ej.splice( idx, 0, Tactile.mul( drag_T, pt ) );
				cacheTileShape();
				loop();
				return;
			}

			P = Q;
		}
	}

	calcEditorTransform();
	loop();
}

function mouseReleased()
{
	dragging = false;
}

function keyPressed()
{
	if( keyCode === RIGHT_ARROW ) {
		nextTilingType();
		loop();
	} else if( keyCode === LEFT_ARROW ) {
		prevTilingType();
		loop();
	} else if( key == ' ' ) {
		show_controls = !show_controls;
		if( show_controls ) {
			QS.expand();
		} else {
			QS.collapse();
		}
		loop();
	} else if( key == ',' || key == '<' ) {
		zoom /= 0.9;
		loop();
	} else if( key == '.' || key == '>' ) {
		zoom *= 0.9;
		loop();
	}
}

function setup()
{
	let canvas = createCanvas( 800, 600 );
	canvas.parent( "sktch" );

	the_type = 0;
	const tp = Tactile.tiling_types[ the_type ];
	tiling = new Tactile.IsohedralTiling( tp );

	editor_pane = createGraphics( editor_w, editor_h );

	let res = document.getElementById( "sktch" ).getBoundingClientRect();
	QS = QuickSettings.create(
		res.left + window.scrollX + 10, res.top + window.scrollY + 10, 
		"Tiling: IH01" );
	for( let idx = 0; idx < 6; ++idx ) {
		QS.addRange( "v" + idx, 0, 2, 1, 0.0001, null );
		QS.hideControl( "v" + idx );
	}

	QS.setGlobalChangeHandler( slide );

	setTilingType();
}

function draw()
{
	background( 255 );

	drawTiling();

	if( show_controls ) {
		drawEditor();
	}

	if( false ) {
		fill( 255, 220 );
		noStroke();
		rect( width - 80, 0, 80, 35 );

		textSize( 26 );
		fill( 0 );
		const tt = Tactile.tiling_types[ the_type ];
		if( tt < 10 ) {
			text( "IH0" + Tactile.tiling_types[ the_type ], width-70, 28 );
		} else {
			text( "IH" + Tactile.tiling_types[ the_type ], width-70, 28 );
		}
	}

	noLoop();
}
