/*
 * Tactile-JS
 * Copyright 2018 Craig S. Kaplan, csk@uwaterloo.ca
 *
 * Distributed under the terms of the 3-clause BSD license.  See the
 * file "LICENSE" for more information.
 */

// Here's a slightly fancier demo, intended to work well on mouse
// and touch interfaces.  It's a bit messier -- hopefully I'll clean
// up the code in the future.

let the_type = null;
let params = null;
let tiling = null;
let edges = null;
let tile_shape = null;

let phys_unit; // Ideally, about a centimeter
let edit_button_box = null;
let save_button_box = null;
let prev_box = null;
let next_box = null;
let navigator_box = null;
let edit_box = null;
let slide_w = null;
let slide_h = null;

const MODE_NONE = 9000;
const MODE_MOVE_VERTEX = 9001;
const MODE_ADJ_TILE = 9002;
const MODE_ADJ_TV = 9003;
const MODE_ADJ_TILING = 9004;

let tiling_T = null;
let tiling_iT = null;

let tiling_T_down = null;

let mode = MODE_NONE;
let drag_tv = null;
let drag_tv_offs = null;

let editor_T;
let editor_T_down;
let drag_edge_shape = -1;
let drag_vertex = -1;
let drag_T = null;
let u_constrain = false;

let down_motion = null;
let delete_timer = null;

let editor_pane = null;
let show_controls = false;

let msgs = [];
let DEBUG = true;
function dbg( s ) {
	if( DEBUG ) {
		msgs.push( s );
		loop();
	}
}

const COLS = [
	[ 25, 52, 65 ],
	[ 62, 96, 111 ],
	[ 145, 170, 157 ],
	[ 209, 219, 189 ],
	[ 252, 255, 245 ],
	[ 219, 188, 209 ] ];

function sub( V, W ) { return { x: V.x-W.x, y: V.y-W.y }; }
function dot( V, W ) { return V.x*W.x + V.y*W.y; }
function len( V ) { return sqrt( dot( V, V ) ); }
function ptdist( V, W ) { return len( sub( V, W ) ); }
function inv( T ) {
	const det = T[0]*T[4] - T[1]*T[3];
	return [T[4]/det, -T[1]/det, (T[1]*T[5]-T[2]*T[4])/det,
		-T[3]/det, T[0]/det, (T[2]*T[3]-T[0]*T[5])/det];
}
function normalize( V ) {
	const l = len( V );
	return { x: V.x / l, y: V.y / l };
}

function makeBox( x, y, w, h )
{
	return { x: x, y: y, w: w, h: h };
}

function hitBox( x, y, B )
{
	return (x >= B.x) && (x <= (B.x+B.w)) && (y >= B.y) && (y <= (B.y+B.h));
}

let fake_serial = 123456;
let all_touch_ids = [];
let my_touches = {};
let num_touches = 0;
let max_touches = 1;

function addTouch( x, y, id )
{
	if( num_touches < max_touches ) {	
		my_touches[id] = {
			down: { x: x, y: y },
			prev: { x: x, y: y },
			pos: { x: x, y: y },
			id: id,
			t: millis() };
		++num_touches;
		doTouchStarted( id );
	}
}

function touchStarted()
{
	if( touches.length == 0 ) {
		addTouch( mouseX, mouseY, fake_serial );
		++fake_serial;
	} else {
		all_touch_ids = [];
		for( let tch of touches ) {
			all_touch_ids.push( tch.id );

			if( !(tch.id in my_touches) ) {
				addTouch( tch.x, tch.y, tch.id );
			}
		}
	}

	return false;
}

function touchMoved()
{
	if( num_touches > 0 ) {
		if( touches.length == 0 ) {
			for( let k in my_touches ) {
				let tch = my_touches[k];

				tch.prev = tch.pos;
				tch.pos = { x: mouseX, y: mouseY };
			}
		} else {
			for( let tch of touches ) {
				if( tch.id in my_touches ) {
					let atch = my_touches[ tch.id ];
					atch.prev = atch.pos;
					atch.pos = { x: tch.x, y: tch.y };
				}
			}
		}

		doTouchMoved();
	}
	return false;
}

function touchEnded()
{
	// If we're on a mouse device, touches will be empty and this should
	// work regardless.

	let new_ids = [];

	for( let k in my_touches ) {
		my_touches[k].present = false;
	}

	for( let tch of touches ) {
		const id = tch.id;
		new_ids.push( id );
		if( id in my_touches ) {
			my_touches[id].present = true;
		}
	}

	for( let k in my_touches ) {
		if( !my_touches[k].present ) {
			// This one is going away.
			doTouchEnded( k );
			delete my_touches[ k ];
			--num_touches;
		}
	}

	u_constrain = false;

	return false;
}

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

function getTilingRect()
{
	const ww = window.innerWidth;
	const hh = window.innerHeight;

	const t1l = len( tiling.getT1() );
	const t2l = len( tiling.getT2() );

	const margin = sqrt( t1l*t1l + t2l*t2l );

	const pts = [
		Tactile.mul( tiling_iT, { x: 0, y: hh } ),
		Tactile.mul( tiling_iT, { x: ww, y: hh } ),
		Tactile.mul( tiling_iT, { x: ww, y: 0 } ),
		Tactile.mul( tiling_iT, { x: 0, y: 0 } ) ];

	const v = normalize( sub( pts[1], pts[0] ) );
	const w = normalize( sub( pts[3], pts[0] ) );

	return [
		{ x: pts[0].x+margin*(-v.x-w.x), y: pts[0].y+margin*(-v.y-w.y) },
		{ x: pts[1].x+margin*(v.x-w.x), y: pts[1].y+margin*(v.y-w.y) },
		{ x: pts[2].x+margin*(v.x+w.x), y: pts[2].y+margin*(v.y+w.y) },
		{ x: pts[3].x+margin*(-v.x+w.x), y: pts[3].y+margin*(-v.y+w.y) } ];
}

function drawTiling()
{
	stroke( COLS[0][0], COLS[0][1], COLS[0][2] );
	strokeWeight( 1.0 );

 	const bx = getTilingRect();
	for( let i of tiling.fillRegionQuad( bx[0], bx[1], bx[2], bx[3] ) ) {
		const TT = i.T;
		const T = Tactile.mul( tiling_T, TT );

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

	const ww = edit_box.w - 5 * phys_unit;

	const sc = Math.min( (ww-50) / (xmax-xmin), (edit_box.h-50) / (ymax-ymin) );

	editor_T = Tactile.mul( 
		[sc, 0, 0.5*ww+25, 0, -sc, 0.5*edit_box.h],
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
	pg.rect( 0, 0, edit_box.w, edit_box.h );

	pg.strokeWeight( 2.0 );
	pg.fill( COLS[3][0], COLS[3][1], COLS[3][2] );

	pg.beginShape();
	for( let v of tile_shape ) {
		const P = Tactile.mul( editor_T, v );
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

		const M = Tactile.mul( editor_T, i.T );
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
		const pt = Tactile.mul( editor_T, v );
		pg.ellipse( pt.x, pt.y, 10.0, 10.0 );
	}

	// Draw editable vertices
	for( let i of tiling.parts() ) {
		const shp = i.shape;
		const id = i.id;
		const ej = edges[id];
		const T = Tactile.mul( editor_T, i.T );

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

	// Draw sliders
	const params = tiling.getParameters();
	let yy = 25;
	const xx = edit_box.w - 25 - slide_w;
	pg.textSize( slide_h * 0.75 );

	for( let i = 0; i < params.length; ++i ) {
		pg.fill( 200 );
		pg.stroke( 60 );
		pg.strokeWeight( 0.5 );
		pg.rect( xx, yy, slide_w, slide_h );

		pg.fill( 60 );
		pg.noStroke();
		pg.rect( map( params[i],
			0, 2, xx, xx+slide_w-slide_h ), yy, slide_h, slide_h );

		pg.text( "v" + i, xx - slide_h, yy + slide_h * 0.75 );

		yy += slide_h + 10;
	}
	// pg.text( "" + slide_h, xx, yy + 20 );

	image( pg, edit_box.x, edit_box.y );

	strokeWeight( 3.0 );
	stroke( 25, 52, 65, 220 );
	noFill();
	rect( edit_box.x, edit_box.y, edit_box.w, edit_box.h );
}

function deleteVertex()
{
	edges[drag_edge_shape].splice( drag_vertex, 1 );
	mode = MODE_NONE;
	cacheTileShape();
	loop();
}

function saveSVG() 
{
	const xmlns = "http://www.w3.org/2000/svg";
	const svgElement = getTilingSVG( xmlns );
	const s = new XMLSerializer();
	const svgFile = s.serializeToString( svgElement ).split( '\n' );
	save( svgFile, "tiling", "svg" );
}

function getTilingSVG( namespace )
{
	let svgElement = document.createElementNS( namespace,'svg' );
	svgElement.setAttribute( 'xmlns:xlink','http://www.w3.org/1999/xlink' );
	svgElement.setAttribute( 'height', window.innerHeight );
	svgElement.setAttribute( 'width', window.innerWidth );

	let tileSVG = getTileShapeSVG( namespace );
	svgElement.appendChild( tileSVG );
    
	const bx = getTilingRect();
	for ( let i of tiling.fillRegionQuad( bx[0], bx[1], bx[2], bx[3] ) ) {
		const T = Tactile.mul( tiling_T, i.T );
		const svg_T = [ T[0], T[3], T[1], T[4], T[2], T[5] ].map( t => +t.toFixed(3) );

		const col = COLS[ tiling.getColour( i.t1, i.t2, i.aspect ) + 1 ];
        
		let tile = document.createElementNS( namespace, 'use' );
		tile.setAttribute( 'xlink:href', '#tile-shape' );
		tile.setAttribute( 'fill', `rgb(${col[0]},${col[1]},${col[2]})` );
		tile.setAttribute( 'transform', `matrix(${svg_T})` );
		svgElement.appendChild( tile );
	}

	return svgElement;
}

function getTileShapeSVG( namespace )
{
	let defs = document.createElementNS( namespace, 'defs' );
	let symbol = document.createElementNS( namespace, 'symbol' );
	let polygon = document.createElementNS( namespace, 'polygon' );

	let points = tile_shape.map( v => `${+v.x.toFixed(3)},${+v.y.toFixed(3)}` );

	polygon.setAttribute( 'points', points.join(' ') );
	polygon.setAttribute( 'stroke', 'black' );
	polygon.setAttribute( 'vector-effect', 'non-scaling-stroke' );

	symbol.setAttribute( 'id', 'tile-shape' );
	symbol.setAttribute( 'overflow', 'visible' );
	symbol.appendChild( polygon );
	defs.appendChild( symbol );

	return defs;
}

function doTouchStarted( id )
{
	// First, check if this touch is intended to initiate an
	// instantaneous action.

	if( mode == MODE_NONE ) {
		if( hitBox( mouseX, mouseY, edit_button_box ) ) {
			show_controls = !show_controls;
			loop();
			return false;
		}

		if( hitBox( mouseX, mouseY, save_button_box ) ) {
			saveSVG();
			loop();
			return false;
		}

		if( hitBox( mouseX, mouseY, prev_box ) ) {
			prevTilingType();
			loop();
			return false;
		}

		if( hitBox( mouseX, mouseY, next_box ) ) {
			nextTilingType();
			loop();
			return false;
		}
	}

	// If not, we assume that it might be the start of a new gesture.

	if( show_controls ) {
		const pt = { x: mouseX - edit_box.x, y: mouseY - edit_box.y };

		if( (pt.x < 0) || (pt.x > edit_box.w) ) {
			return false;
		}
		if( (pt.y < 0) || (pt.y > edit_box.h) ) {
			return false;
		}

		// Check for a sliding gesture on one of the tiling vertex
		// parameter sliders.
		const params = tiling.getParameters();
		let yy = 25;
		const xx = edit_box.w - 25 - slide_w;

		for( let i = 0; i < params.length; ++i ) {
			const x = map( params[i], 0, 2, xx, xx+slide_w-slide_h );

			if( hitBox( pt.x, pt.y, makeBox( x, yy, slide_h, slide_h ) ) ) {
				mode = MODE_ADJ_TV;
				max_touches = 1;
				drag_tv = i;
				drag_tv_offs = pt.x - x;
				return false;
			}

			yy += slide_h + 10;
		}

		// Nothing yet.  OK, try the geometric features of the tiling.
		for( let i of tiling.parts() ) {
			const shp = i.shape;

			// No interaction possible with an I edge.
			if( shp == Tactile.I ) {
				continue;
			}

			const id = i.id;
			let ej = edges[id];
			const T = Tactile.mul( editor_T, i.T );
			let P = Tactile.mul( T, ej[0] );

			for( let idx = 1; idx < ej.length; ++idx ) {
				let Q = Tactile.mul( T, ej[idx] );
				if( ptdist( Q, pt ) < 0.5 * phys_unit ) {
					u_constrain = false;
					if( idx == (ej.length-1) ) {
						if( shp == Tactile.U && !i.second ) {
							u_constrain = true;
						} else {
							break;
						}
					}

					mode = MODE_MOVE_VERTEX;
					max_touches = 1;
					drag_edge_shape = id;
					drag_vertex = idx;
					drag_T = inv( T );
					down_motion = pt;

					// Set timer for deletion.  But not on a U vertex.
					if( !u_constrain ) {
						delete_timer = setTimeout( deleteVertex, 1000 );
					}

					loop();
					return false;
				}

				// Check segment
				if( distToSeg( pt, P, Q ) < 20 ) {
					mode = MODE_MOVE_VERTEX;
					max_touches = 1;
					drag_edge_shape = id;
					drag_vertex = idx;
					drag_T = inv( T );
					down_motion = pt;
					// Don't set timer -- can't delete new vertex.

					ej.splice( idx, 0, Tactile.mul( drag_T, pt ) );
					cacheTileShape();
					loop();
					return false;
				}

				P = Q;
			}
		}

		mode = MODE_ADJ_TILE;
		editor_T_down = editor_T;
		max_touches = 2;
	 } else {
		mode = MODE_ADJ_TILING;
		tiling_T_down = tiling_T;
		max_touches = 2;
	}

	return false;
}

function getTouchRigid()
{
	const ks = Object.keys( my_touches );

	if( num_touches == 1 ) {
		// Just translation.
		const tch = my_touches[ks[0]];
		const dx = tch.pos.x - tch.down.x;
		const dy = tch.pos.y - tch.down.y;

		return [ 1.0, 0.0, dx, 0.0, 1.0, dy ];
	} else {
		// Full rigid.
		const tch1 = my_touches[ks[0]];
		const tch2 = my_touches[ks[1]];

		const P1 = tch1.down;
		const P2 = tch1.pos;
		const Q1 = tch2.down;
		const Q2 = tch2.pos;

		const M1 = Tactile.matchSeg( P1, Q1 );
		const M2 = Tactile.matchSeg( P2, Q2 );
		const M = Tactile.mul( M2, inv( M1 ) );

		return M;
	}
}

function doTouchMoved()
{
	if( mode == MODE_ADJ_TILING ) {
		const M = getTouchRigid();
		tiling_T = Tactile.mul( M, tiling_T_down );
		tiling_iT = inv( tiling_T );
		loop();
		return false;
	} else if( mode == MODE_ADJ_TILE ) {
		const M = getTouchRigid();
		editor_T = Tactile.mul( M, editor_T_down );
		loop();
		return false;
	} else if( mode == MODE_ADJ_TV ) {
		// FIXME -- it would be better if this mode and MODE_MOVE_VERTEX
		// used my_touches instead of mouseX and mouseY.  Oh well.

		const params = tiling.getParameters();
		let yy = 25 + 30*drag_tv;
		const xx = edit_box.w - 25 - 5*phys_unit;

		const t = map(
			mouseX-edit_box.x-drag_tv_offs, xx, xx+5*phys_unit-20, 0, 2 );
		params[drag_tv] = t;
		tiling.setParameters( params );
		cacheTileShape();
		loop();
	} else if( mode == MODE_MOVE_VERTEX ) {
		const pt = { x: mouseX - edit_box.x, y: mouseY - edit_box.y };
		const npt = Tactile.mul( drag_T, pt );

		if( u_constrain ) {
			npt.x = 1.0;
		}
		const d = dist( pt.x, pt.y, down_motion.x, down_motion.y );
		if( d > 10 ) {
			// You've moved far enough, so don't delete.
			if( delete_timer ) {
				clearTimeout( delete_timer );
				delete_timer = null;
			}
		}

		edges[drag_edge_shape][drag_vertex] = npt;
		cacheTileShape();
		loop();
	}

	return false;
}

function doTouchEnded( id )
{
	if( delete_timer ) {
		clearTimeout( delete_timer );
		delete_timer = null;
	}
	mode = MODE_NONE;
}

function setupInterface()
{
	let w = window.innerWidth;
	let h = window.innerHeight;

	// Any way to fix this for different devices?
	phys_unit = 60;

	edit_button_box = makeBox(
		0.25 * phys_unit, 0.25 * phys_unit, phys_unit, phys_unit );
	save_button_box = makeBox(
		1.5 * phys_unit, 0.25 * phys_unit, phys_unit, phys_unit );
	navigator_box = makeBox(
		w - 5.25 * phys_unit, 0.25 * phys_unit, 5 * phys_unit, phys_unit );
	prev_box = makeBox(
		navigator_box.x, navigator_box.y, phys_unit, phys_unit );
	next_box = makeBox( 
		navigator_box.x + navigator_box.w - phys_unit, navigator_box.y,
		phys_unit, phys_unit );

	edit_box = makeBox( 
		0.25*phys_unit, 1.5*phys_unit, 
		Math.min( 800, 0.8*w ), Math.min( 600, 0.8*h ) );

	slide_w = 5 * phys_unit;
	slide_h = 0.7 * phys_unit;

	editor_pane = createGraphics( edit_box.w, edit_box.h );
}

function setup()
{
	let w = window.innerWidth;
	let h = window.innerHeight;

	let canvas = createCanvas( w, h );
	canvas.parent( "sktch" );

	const asp = w / h;
	const hh = 6.0;
	const ww = asp * hh;
	const sc = h / (2*hh);

	tiling_T = Tactile.mul(
		[1, 0, width/2.0, 0, 1, height/2.0],
		[sc, 0, 0, 0, -sc, 0] );
	tiling_iT = inv( tiling_T );

	setupInterface();
	// calcTilingTransforms();

	the_type = 0;
	const tp = Tactile.tiling_types[ the_type ];
	tiling = new Tactile.IsohedralTiling( tp );

	setTilingType();
}

function windowResized()
{
	resizeCanvas( window.innerWidth, window.innerHeight );
	setupInterface();
	loop();
}

function drawIcon( drf, B )
{
	push();
	translate( B.x, B.y + B.h );
	scale( B.w / 200.0 );
	scale( 1.0, -1.0 );
	drf();
	pop();
}

function draw()
{
	background( 255 );

	drawTiling();

	drawIcon( drawEditIcon, edit_button_box );
	drawIcon( drawSaveIcon, save_button_box );

	fill( 252, 255, 254, 220 );
	stroke( 0 );
	strokeWeight( 4 );
	rect( navigator_box.x, navigator_box.y, 
		navigator_box.w, navigator_box.h, 5 );

	const tt = Tactile.tiling_types[ the_type ];
	const name = ((tt<10)?"IH0":"IH") + Tactile.tiling_types[ the_type ];
	textAlign( CENTER );
	textSize( 0.75 * phys_unit );
	fill( 0 );
	noStroke();
	text( name, navigator_box.x + 0.5*navigator_box.w,
		navigator_box.y + 0.75*navigator_box.h );
		
	fill( (the_type > 0) ? 0 : 200 );
	drawIcon( () => triangle( 35, 100, 165, 30, 165, 170 ), prev_box );
	fill( (the_type < 80) ? 0 : 200 );
	drawIcon( () => triangle( 165, 100, 35, 30, 35, 170 ), next_box );

	if( show_controls ) {
		drawEditor();
	}

	fill( 255 );
	noStroke();
	textSize( 24 );
	textAlign( LEFT );
	let c = 0;
	c += 32;
	for( let i = Math.max( 0, msgs.length - 10 ); i < msgs.length; ++i ) {
		text( msgs[i], 25, 200+c );
		c = c + 32;
	}

	noLoop();
}

function drawSaveIcon()
{
	drawIconBackground();

	fill( 0, 0, 0 );
	beginShape();
	vertex( 133.75, 161.5 );
	vertex( 51.25, 161.5 );
	bezierVertex( 43.6172, 161.5, 37.5, 155.313, 37.5, 147.75 );
	vertex( 37.5, 51.5 );
	bezierVertex( 37.5, 43.9375, 43.6172, 37.75, 51.25, 37.75 );
	vertex( 147.5, 37.75 );
	bezierVertex( 155.063, 37.75, 161.25, 43.9375, 161.25, 51.5 );
	vertex( 161.25, 134.0 );
	beginContour();
	vertex( 99.375, 51.5 );
	bezierVertex( 87.9609, 51.5, 78.75, 60.7109, 78.75, 72.125 );
	bezierVertex( 78.75, 83.5391, 87.9609, 92.75, 99.375, 92.75 );
	bezierVertex( 110.789, 92.75, 120.0, 83.5391, 120.0, 72.125 );
	bezierVertex( 120.0, 60.7109, 110.789, 51.5, 99.375, 51.5 );
	endContour();
	beginContour();
	vertex( 120.0, 120.25 );
	vertex( 51.25, 120.25 );
	vertex( 51.25, 147.75 );
	vertex( 120.0, 147.75 );
	endContour();
	endShape( CLOSE );

	drawIconOutline();
}

function drawEditIcon() 
{
	drawIconBackground();

	fill( 0, 0, 0 );
	beginShape();
	vertex( 119.539, 148.27 );
	vertex( 82.0313, 109.57 );
	bezierVertex( 87.8008, 103.59, 93.8594, 97.9297, 99.0508, 91.5508 );
	vertex( 132.051, 125.602 );
	bezierVertex( 132.93, 126.512, 134.648, 126.281, 135.898, 125.09 );
	vertex( 136.301, 124.711 );
	bezierVertex( 137.551, 123.52, 137.852, 121.82, 136.969, 120.91 );
	vertex( 103.16, 86.0313 );
	bezierVertex( 104.309, 84.3086, 105.391, 82.5195, 106.371, 80.6484 );
	vertex( 146.738, 122.301 );
	vertex( 119.539, 148.27 );
	endShape( CLOSE );
	fill( 0, 0, 0 );
	beginShape();
	vertex( 79.6211, 61.7383 );
	bezierVertex( 78.7383, 60.8281, 77.0117, 61.0586, 75.7695, 62.25 );
	vertex( 75.3711, 62.6289 );
	bezierVertex( 74.1211, 63.8203, 73.8203, 65.5195, 74.6992, 66.4297 );
	vertex( 112.578, 105.512 );
	bezierVertex( 107.738, 112.25, 102.48, 118.711, 95.75, 123.73 );
	vertex( 51.0586, 77.6289 );
	vertex( 78.2617, 51.6484 );
	vertex( 120.059, 94.7813 );
	bezierVertex( 118.891, 96.4609, 117.719, 98.1484, 116.539, 99.8516 );
	vertex( 79.6211, 61.7383 );
	endShape( CLOSE );
	fill( 0, 0, 0 );
	beginShape();
	vertex( 151.391, 127.102 );
	vertex( 124.191, 153.078 );
	vertex( 131.961, 161.102 );
	bezierVertex( 136.391, 165.672, 145.07, 164.512, 151.359, 158.512 );
	vertex( 155.801, 154.27 );
	bezierVertex( 162.078, 148.27, 163.59, 139.699, 159.16, 135.129 );
	vertex( 151.391, 127.102 );
	endShape( CLOSE );
	fill( 0, 0, 0 );
	beginShape();
	vertex( 37.6016, 41.3789 );
	vertex( 46.4102, 72.8203 );
	vertex( 60.0117, 59.8281 );
	vertex( 73.6094, 46.8398 );
	vertex( 42.3008, 36.8906 );
	bezierVertex( 39.9609, 36.1484, 36.9414, 39.0313, 37.6016, 41.3789 );
	endShape( CLOSE );

	drawIconOutline();
}

function drawIconBackground()
{
	fill( 252, 255, 254, 220 );
	beginShape();
	vertex( 180.0, 7.94141 );
	vertex( 19.2188, 7.94141 );
	bezierVertex( 12.6211, 7.94141, 7.21875, 13.3398, 7.21875, 19.9414 );
	vertex( 7.21875, 180.73 );
	bezierVertex( 7.21875, 187.328, 12.6211, 192.73, 19.2188, 192.73 );
	vertex( 180.0, 192.73 );
	bezierVertex( 186.602, 192.73, 192.0, 187.328, 192.0, 180.73 );
	vertex( 192.0, 19.9414 );
	bezierVertex( 192.0, 13.3398, 186.602, 7.94141, 180.0, 7.94141 );
	endShape( CLOSE );
}

function drawIconOutline()
{
	fill( 0, 0, 0 );
	beginShape();
	vertex( 85.75, 15.2109 );
	vertex( 177.18, 15.2109 );
	bezierVertex( 181.371, 15.2109, 184.789, 18.6211, 184.789, 22.8203 );
	vertex( 184.789, 177.18 );
	bezierVertex( 184.789, 181.371, 181.379, 184.789, 177.18, 184.789 );
	vertex( 84.4453, 184.789 );
	vertex( 84.4453, 200.0 );
	vertex( 177.18, 200.0 );
	bezierVertex( 189.762, 200.0, 200.0, 189.762, 200.0, 177.18 );
	vertex( 200.0, 22.8203 );
	bezierVertex( 200.0, 10.2383, 189.762, 0.0, 177.18, 0.0 );
	vertex( 84.0117, 0.0 );
	vertex( 85.75, 15.2109 );
	endShape( CLOSE );
	fill( 0, 0, 0 );
	beginShape();
	vertex( 114.25, 184.789 );
	vertex( 22.8203, 184.789 );
	bezierVertex( 18.6289, 184.789, 15.2109, 181.379, 15.2109, 177.18 );
	vertex( 15.2109, 22.8203 );
	bezierVertex( 15.2109, 18.6289, 18.6211, 15.2109, 22.8203, 15.2109 );
	vertex( 115.555, 15.2109 );
	vertex( 115.555, 0.0 );
	vertex( 22.8203, 0.0 );
	bezierVertex( 10.2383, 0.0, 0.0, 10.2383, 0.0, 22.8203 );
	vertex( 0.0, 177.18 );
	bezierVertex( 0.0, 189.762, 10.2383, 200.0, 22.8203, 200.0 );
	vertex( 115.988, 200.0 );
	vertex( 114.25, 184.789 );
	endShape( CLOSE );
}
