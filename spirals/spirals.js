/*
 * Tactile-JS
 * Copyright 2019 Craig S. Kaplan, csk@uwaterloo.ca
 *
 * Distributed under the terms of the 3-clause BSD license.  See the
 * file "LICENSE" for more information.
 */

'use strict';

import { fitCurve } from './fit-curve.js';
import { earcut } from './earcut.js'
import { mul, matchSeg, EdgeShape, numTypes, tilingTypes, IsohedralTiling } 
	from '../lib/tactile.js';

function sktch( p5c )
{
	let the_type = null;
	let params = null;
	let tiling = null;
	let edges = null;
	let tile_shape = null;
	let triangles = null;

	let colouring = null;
	let uniform_colouring = null;
	let min_colouring = null;

	let phys_unit; // Ideally, about a centimeter
	let edit_box = null;

	const MODE_NONE = 9000;
	const MODE_MOVE_VERTEX = 9001;
	const MODE_ADJ_TILE = 9002;
	const MODE_ADJ_TV = 9003;
	const MODE_ADJ_TILING = 9004;

	let spiral_A = 1;
	let spiral_B = 5;
	let tiling_V = { x: 0.0, y: 0.0 };
	let tiling_T = null;
	let tiling_iT = null;

	let tiling_V_down = null;

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
	let animating = false;
	let fullscreen = false;
	let colour = false;

	let fnt = null;

	let msgs = [];
	let DEBUG = true;
	function dbg( s ) {
		if( DEBUG ) {
			msgs.push( s );
			p5c.loop();
		}
	}

	let WIDTH = null;
	let HEIGHT = null;
	const FBO_DIM = 256;
	let fbo = null;
	let fbo_M = null;

	let ih_slider = null;
	let ih_label = null;

	let A_slider = null;
	let A_label = null;
	let B_slider = null;
	let B_label = null;
	let do_mobius = false;

	let tv_sliders = null;

	let help_button = null;
	let fullscreen_button = null;
	let colour_button = null;
	let animate_button = null;
	let save_button = null;

	const COLS = [
		[ 25, 52, 65 ],
		[ 62, 96, 111 ],
		[ 145, 170, 157 ],
		[ 209, 219, 189 ],
		[ 252, 255, 245 ],
		[ 219, 188, 209 ] ];

	const XMLNS = "http://www.w3.org/2000/svg";
	const XLINK = "http://www.w3.org/1999/xlink";

	let shad1;

	class Permutation {
		static rank( p ) {
			let identity = Object.keys( p );
			let product = p.slice();
			let rank = 1;
			while ( product.join() !== identity.join() ) {
				product = this.mult( product, p );
				rank++;
			}
			return rank;
		}

		static pow( p, exp ) {
			let product = p.slice();
			for ( let i = 0; i < exp - 1; i++ ) {
				product = this.mult( product, p );
			}
			return product;
		}

		static mult( p1, p2 ) {
			if ( p1.length !== p2.length ) {
				return [ ];
			}
			return p1.map( x => p2[ x ] );
		}

		static evaluate( p, start, num_times ) {
			let val = p[ start ];
			for ( let idx = 0; idx < num_times; ++idx ) {
				val = p[ val ];
			}
			return val;
		}
	}

	class Colouring {
		constructor( tiling, cols, init, p1, p2 ) {
			this.tiling = tiling;
			this.cols = cols;
			this.init = init;
			this.p1 = p1;
			this.p1rank = Permutation.rank( p1 );
			this.p2 = p2;
			this.p2rank = Permutation.rank( p2 );
		}

		getColour( a, b, asp ) {
		/*
			const nc = this.cols.length;
			let mt = function( a ) {
				let _mt = a % nc;
				return _mt < 0 ? _mt + nc : _mt;
			};
			c = Permutation.evaluate( this.p1, c, mt( a ) );
			c = Permutation.evaluate( this.p2, c, mt( b ) );
		*/
			
			let c = this.init[ asp ];
			const r1 = this.p1rank;
			const r2 = this.p2rank;

			c = Permutation.evaluate( this.p1, c, ((a%r1)+r1)%r1 );
			c = Permutation.evaluate( this.p2, c, ((b%r2)+r2)%r2 );

			return this.cols[ c ];
		}
	}

	class UniformColouring extends Colouring {
		constructor( tiling, col ) {
			const nasps = tiling.numAspects();
			const init = new Array( nasps ).fill( 0 );
			const p = [ 0 ];
			super( tiling, [ col ], init, p, p );
		}
	}

	class MinColouring extends Colouring {
		constructor( tiling, cols ) {
			const clrg = tiling.ttd.colouring;
			const init = clrg.slice( 0, tiling.numAspects() );
			const p1 = clrg.slice( 12, 15 );
			const p2 = clrg.slice( 15, 18 );
			super( tiling, cols, init, p1, p2 );
		}
	}

	function sub( V, W ) { return { x: V.x-W.x, y: V.y-W.y }; }
	function dot( V, W ) { return V.x*W.x + V.y*W.y; }
	function len( V ) { return Math.sqrt( dot( V, V ) ); }
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
				t: p5c.millis() };
			++num_touches;
			doTouchStarted( id );
		}
	}

	p5c.touchStarted = function()
	{
		if( p5c.touches.length == 0 ) {
			addTouch( p5c.mouseX, p5c.mouseY, fake_serial );
			++fake_serial;
		} else {
			all_touch_ids = [];
			for( let tch of p5c.touches ) {
				all_touch_ids.push( tch.id );

				if( !(tch.id in my_touches) ) {
					addTouch( tch.x, tch.y, tch.id );
				}
			}
		}
	}

	p5c.touchMoved = function()
	{
		if( num_touches > 0 ) {
			if( p5c.touches.length == 0 ) {
				for( let k in my_touches ) {
					let tch = my_touches[k];

					tch.prev = tch.pos;
					tch.pos = { x: p5c.mouseX, y: p5c.mouseY };
				}
			} else {
				for( let tch of p5c.touches ) {
					if( tch.id in my_touches ) {
						let atch = my_touches[ tch.id ];
						atch.prev = atch.pos;
						atch.pos = { x: tch.x, y: tch.y };
					}
				}
			}

			return doTouchMoved();
		}
	}

	p5c.touchEnded = function()
	{
		// If we're on a mouse device, touches will be empty and this should
		// work regardless.

		let new_ids = [];

		for( let k in my_touches ) {
			my_touches[k].present = false;
		}

		for( let tch of p5c.touches ) {
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
	}

	function cacheTileShape()
	{
		tile_shape = [];
		let blah = [];

		for( let i of tiling.parts() ) {
			const ej = edges[i.id];
			let cur = i.rev ? (ej.length-2) : 1;
			const inc = i.rev ? -1 : 1;

			for( let idx = 0; idx < ej.length - 1; ++idx ) {
				const { x, y } = mul( i.T, ej[cur] );
				tile_shape.push( { x : x, y : y } );
				blah.push( x );
				blah.push( y );
				cur += inc;
			}
		}

		triangles = earcut( blah );

		drawTranslationalUnit();
	}

	function setTilingType()
	{
		const tp = tilingTypes[ the_type ];
		tiling.reset( tp );
		params = tiling.getParameters();

		uniform_colouring = new UniformColouring( tiling, COLS[ 4 ] );
		min_colouring = new MinColouring( tiling, COLS.slice( 1, 4 ) );

		edges = [];
		for( let idx = 0; idx < tiling.numEdgeShapes(); ++idx ) {
			let ej = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
			edges.push( ej );
		}

		cacheTileShape();
		calcEditorTransform();

		if( tv_sliders != null ) {
			for( let s of tv_sliders ) {
				s.remove();
			}
			tv_sliders = null;
		}

		let yy = 50;
		tv_sliders = [];

		for( let i = 0; i < params.length; ++i ) {
			let sl = p5c.createSlider( 0.0, 500.0, params[i] * 250.0 );
			sl.position( WIDTH/2 + 20, yy );
			sl.style( "width", "" + (WIDTH/2-100) + "px" );
			sl.input( parameterChanged );
			yy += 30;
			tv_sliders.push( sl );
		}
	}

	function parameterChanged()
	{
		if( tv_sliders != null ) {
			const params = tv_sliders.map( sl => sl.value() / 250.0 );
			tiling.setParameters( params );
			cacheTileShape();
			p5c.loop();
		}
	}

	function tilingTypeChanged()
	{
		the_type = p5c.int( ih_slider.value() );
		const tt = tilingTypes[ the_type ];
		const name = ((tt<10)?"IH0":"IH") + tt;
		ih_label.html( name );

		setTilingType();

		p5c.loop();
	}

	function spiralChanged()
	{
		spiral_A = p5c.int( A_slider.value() );
		spiral_B = p5c.int( B_slider.value() );
		calculateTilingTransform();

		A_label.html( "A: " + spiral_A );
		B_label.html( "B: " + spiral_B );

		p5c.loop();
	}

	function getTilingRect( t1, t2 )
	{
		const t1l = len( tiling.getT1() );
		const t2l = len( tiling.getT2() );

		const margin = Math.sqrt( t1l*t1l + t2l*t2l );

		const det = t1.x*t2.y - t2.x*t1.y;

		const pts = [
			{ x: 0, y: 0 },
			(det < 0.0) ? t2 : t1,
			{ x: t1.x + t2.x, y: t1.y + t2.y },
			(det < 0.0) ? t1 : t2 ];

		const v = normalize( sub( pts[1], pts[0] ) );
		const w = normalize( sub( pts[3], pts[0] ) );

		return [
			{ x: pts[0].x+margin*(-v.x-w.x), y: pts[0].y+margin*(-v.y-w.y) },
			{ x: pts[1].x+margin*(v.x-w.x), y: pts[1].y+margin*(v.y-w.y) },
			{ x: pts[2].x+margin*(v.x+w.x), y: pts[2].y+margin*(v.y+w.y) },
			{ x: pts[3].x+margin*(-v.x+w.x), y: pts[3].y+margin*(-v.y+w.y) } ];
	}

	function scaleVec( v, a )
	{
		return { x: v.x * a, y: v.y * a };
	}

	function drawTranslationalUnit()
	{
		if( fbo == null ) {
			fbo = p5c.createGraphics( FBO_DIM, FBO_DIM );
		}

		fbo.background( 255, 0, 0 );

		colouring = colour ? min_colouring : uniform_colouring;

		const r1 = Permutation.rank( colouring.p1 );
		const r2 = Permutation.rank( colouring.p2 );

		const t1 = scaleVec( tiling.getT1(), r1 );
		const t2 = scaleVec( tiling.getT2(), r2 );

		const det = (t1.x*t2.y - t2.x*t1.y);
		fbo_M = [ t2.y / det, -t1.y / det, -t2.x / det, t1.x / det ];
		const M = fbo_M;

		const est_sc = Math.sqrt( Math.abs( det / (r1 * r2) ) );
		// console.log( est_sc );

		fbo.push();
		fbo.applyMatrix( M[0], M[1], M[2], M[3], 0.0, 0.0 );
		const bx = getTilingRect( t1, t2 );

		for( let i of tiling.fillRegionQuad( bx[0], bx[1], bx[2], bx[3] ) ) {
			const TT = i.T;
			let tshape = [];
			for( let v of tile_shape ) {
				let P = mul( TT, v );
				P.x *= FBO_DIM;
				P.y *= FBO_DIM;
				tshape.push( P );
			}

			const col = colouring.getColour( i.t1, i.t2, i.aspect );
			fbo.fill( col[0], col[1], col[2] );
			fbo.stroke( col[0], col[1], col[2] );
			fbo.strokeWeight( est_sc );

			for( let idx = 0; idx < triangles.length; idx += 3 ) {
				fbo.triangle( 
					tshape[triangles[idx]].x, tshape[triangles[idx]].y,
					tshape[triangles[idx+1]].x, tshape[triangles[idx+1]].y,
					tshape[triangles[idx+2]].x, tshape[triangles[idx+2]].y );
			}

			fbo.stroke( COLS[0][0], COLS[0][1], COLS[0][2] );
			fbo.strokeWeight( 20 * est_sc );
			fbo.strokeJoin( p5c.ROUND );
			fbo.noFill();

			for( let idx = 0; idx < tile_shape.length; ++idx ) {
				const P = tshape[idx];
				const Q = tshape[(idx+1)%tile_shape.length];

				fbo.line( P.x, P.y, Q.x, Q.y );
			}
		}

		fbo.pop();

/*
		fbo.noFill();
		fbo.stroke( 255, 0, 0 );
		fbo.strokeWeight( 1 );
		fbo.rect( 0, 0, FBO_DIM, FBO_DIM );
		*/

		calculateTilingTransform();
	}

	function calculateTilingTransform()
	{
		const t1 = tiling.getT1();
		const t2 = tiling.getT2();
		const pA = Permutation.pow( colouring.p1, spiral_A );
		const pB = Permutation.pow( colouring.p2, spiral_B );
		const rv = Permutation.rank( Permutation.mult( pA, pB ) );

		let v = {
			x: spiral_A * t1.x + spiral_B * t2.x, 
			y: spiral_A * t1.y + spiral_B * t2.y };

		v = scaleVec( v, rv );

		tiling_T = mul(
			matchSeg( {x:0.0,y:0.0}, {x:0.0,y:p5c.TWO_PI} ),
			inv( matchSeg( {x:0.0,y:0.0}, v ) ) );

		tiling_T[2] = tiling_V.x;
		tiling_T[5] = tiling_V.y;

		tiling_iT = inv( tiling_T );
	}

	function drawSpiral()
	{
		p5c.noStroke();
		p5c.shader( shad1 );

		shad1.setUniform( "res", [WIDTH/2, HEIGHT/2] );
		shad1.setUniform( "tex", fbo );
		shad1.setUniform( "mob", do_mobius );
		shad1.setUniform( "fullscreen", fullscreen );

		const M = [fbo_M[0], fbo_M[2], 0.0, fbo_M[1], fbo_M[3], 0.0];
		const T = mul( M, tiling_iT );
		shad1.setUniform( "M", [T[0],T[3],0.0,T[1],T[4],0.0,T[2],T[5],1.0] );

		// rect(WIDTH/2,HEIGHT/2,WIDTH/2,HEIGHT/2);
		// It turns out that it basically doesn't matter what you put here,
		// as long as you send some geometry into the pipeline.  Processing
		// will feed WebGL a rectangle from (0,0) to (1,1) with matching
		// texture coordinates, and the shader will see that in the context
		// of a viewport covering (-1,-1) to (1,1).  So do all the real work
		// in the shader, I guess.
		p5c.rect(0, 1, 2, 3);
	}

	function drawTiling()
	{
		const M = fbo_M;
		const MM = [M[0], M[2], 0.0, M[1], M[3], 0.0];

		let nit = mul( MM, tiling_iT );
		const asp = WIDTH / HEIGHT;

		function vtex( sx, sy, px, py ) 
		{
			let P = mul( nit, { x: px, y: py } );
			p5c.vertex( sx, sy, 1, P.x, P.y );
		}

		p5c.texture( fbo );

		p5c.beginShape();
		vtex( 0, HEIGHT/2, 0, 0 );
		vtex( WIDTH/2, HEIGHT/2, p5c.TWO_PI * asp, 0 );
		vtex( WIDTH/2, HEIGHT, p5c.TWO_PI * asp, p5c.TWO_PI );
		vtex( 0, HEIGHT, 0, p5c.TWO_PI );
		p5c.endShape( p5c.CLOSE );
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
			edit_box.w / (xmax-xmin), edit_box.h / (ymax-ymin) );

		editor_T = mul( 
			[sc, 0, edit_box.x + 0.5*edit_box.w, 0, 
			 -sc, edit_box.y + 0.5*edit_box.h],
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
		p5c.noStroke();
		p5c.fill( 252, 255, 254, 220 );
		p5c.rect( 0, 0, WIDTH/2, HEIGHT/2 );

		p5c.fill( COLS[3][0], COLS[3][1], COLS[3][2] );

		let tshape = [];

		for( let v of tile_shape ) {
			tshape.push( mul( editor_T, v ) );
		}

		for( let i = 0; i < triangles.length; i += 3 ) {
			p5c.triangle( 
				tshape[triangles[i]].x, tshape[triangles[i]].y,
				tshape[triangles[i+1]].x, tshape[triangles[i+1]].y,
				tshape[triangles[i+2]].x, tshape[triangles[i+2]].y );
		}

		p5c.strokeWeight( 2.0 );
		p5c.noFill();

		// Draw edges
		for( let i of tiling.parts() ) {
			if( i.shape == EdgeShape.I ) {
				p5c.stroke( 158 );
			} else {
				p5c.stroke( 0 );
			}

			const M = mul( editor_T, i.T );
			let prev = null;
			for( let v of edges[i.id] ) {
				const P = mul( M, v );
				if( prev != null ) {
					p5c.line( prev.x, prev.y, P.x, P.y );
				}
				prev = P;
			}
		}

		// Draw tiling vertices
		p5c.noStroke();
		p5c.fill( 158 );
		for( let v of tiling.vertices() ) {
			const pt = mul( editor_T, v );
			p5c.ellipse( pt.x, pt.y, 10.0, 10.0 );
		}

		// Draw editable vertices
		for( let i of tiling.parts() ) {
			const shp = i.shape;
			const id = i.id;
			const ej = edges[id];
			const T = mul( editor_T, i.T );

			for( let idx = 1; idx < ej.length - 1; ++idx ) {
				p5c.fill( 0 );
				const pt = mul( T, ej[idx] );
				p5c.ellipse( pt.x, pt.y, 10.0, 10.0 );
			}

			if( shp == EdgeShape.I || shp == EdgeShape.J ) {
				continue;
			}

			// Draw symmetry points for U and S edges.
			if( !i.second ) {
				if( shp == EdgeShape.U ) {
					p5c.fill( COLS[2][0], COLS[2][1], COLS[2][2] );
				} else {
					p5c.fill( COLS[5][0], COLS[5][1], COLS[5][2] );
				}
				const pt = mul( T, ej[ej.length-1] );
				p5c.ellipse( pt.x, pt.y, 10.0, 10.0 );
			}
		}
	}

	function deleteVertex()
	{
		edges[drag_edge_shape].splice( drag_vertex, 1 );
		mode = MODE_NONE;
		cacheTileShape();
		p5c.loop();
	}

	function doTouchStarted( id )
	{
		for( let b of [help_button, fullscreen_button, colour_button, animate_button, save_button] ) {
			const pos = b.position();
			const sz = b.size();
			const r = makeBox( pos.x, pos.y, sz.width, sz.height );
			if( hitBox( p5c.mouseX, p5c.mouseY, r ) ) {
				return false;
			}
		}

		if( fullscreen || hitBox( p5c.mouseX, p5c.mouseY,
				makeBox( WIDTH/2, HEIGHT/2, WIDTH/2, HEIGHT/2 ) ) ) { 
			do_mobius = !do_mobius;
			p5c.loop();
		} else if( hitBox( p5c.mouseX, p5c.mouseY, 
				makeBox( 0, 0, WIDTH/2, HEIGHT/2 ) ) ) { 
			const pt = { x: p5c.mouseX, y: p5c.mouseY };

			// Nothing yet.  OK, try the geometric features of the tiling.
			for( let i of tiling.parts() ) {
				const shp = i.shape;

				// No interaction possible with an I edge.
				if( shp == EdgeShape.I ) {
					continue;
				}

				const id = i.id;
				let ej = edges[id];
				const T = mul( editor_T, i.T );
				let P = mul( T, ej[0] );

				for( let idx = 1; idx < ej.length; ++idx ) {
					let Q = mul( T, ej[idx] );
					if( ptdist( Q, pt ) < 0.5 * phys_unit ) {
						u_constrain = false;
						if( idx == (ej.length-1) ) {
							if( shp == EdgeShape.U && !i.second ) {
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

						p5c.loop();
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

						ej.splice( idx, 0, mul( drag_T, pt ) );
						cacheTileShape();
						p5c.loop();
						return false;
					}

					P = Q;
				}
			}

			mode = MODE_ADJ_TILE;
			editor_T_down = editor_T;
			max_touches = 2;
		} else if( hitBox( p5c.mouseX, p5c.mouseY,
				makeBox( 0, HEIGHT/2, WIDTH/2, HEIGHT/2 ) ) ) { 
			mode = MODE_ADJ_TILING;
			tiling_V_down = { x: tiling_V.x, y: tiling_V.y };
			max_touches = 1;
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

			const M1 = matchSeg( P1, Q1 );
			const M2 = matchSeg( P2, Q2 );
			const M = mul( M2, inv( M1 ) );

			return M;
		}
	}

	function doTouchMoved()
	{
		if( mode == MODE_ADJ_TILING ) {
			const M = getTouchRigid();
			const sc = p5c.TWO_PI / (HEIGHT/2);
			tiling_V.x = tiling_V_down.x + M[2] * sc;
			tiling_V.y = tiling_V_down.y + M[5] * sc;
			calculateTilingTransform();

			p5c.loop();
			return false;
		} else if( mode == MODE_ADJ_TILE ) {
			const M = getTouchRigid();
			editor_T = mul( M, editor_T_down );
			p5c.loop();
			return false;
		} else if( mode == MODE_MOVE_VERTEX ) {
			// const pt = { x: mouseX - edit_box.x, y: mouseY - edit_box.y };
			const pt = { x: p5c.mouseX, y: p5c.mouseY };
			const npt = mul( drag_T, pt );

			if( u_constrain ) {
				npt.x = 1.0;
			}
			const d = p5c.dist( pt.x, pt.y, down_motion.x, down_motion.y );
			if( d > 10 ) {
				// You've moved far enough, so don't delete.
				if( delete_timer ) {
					clearTimeout( delete_timer );
					delete_timer = null;
				}
			}

			edges[drag_edge_shape][drag_vertex] = npt;
			cacheTileShape();
			p5c.loop();
			return false;
		}

		return true;
	}

	function doTouchEnded( id )
	{
		if( delete_timer ) {
			clearTimeout( delete_timer );
			delete_timer = null;
		}
		mode = MODE_NONE;
	}

	p5c.preload = function()
	{
		fnt = p5c.loadFont( 'assets/helveticaneue.otf' );
		shad1 = p5c.loadShader( "assets/vert1.txt", "assets/frag1.txt" );
	}

	function setLabelStyle( lab )
	{
		lab.style( "font-family", "sans-serif" );
		lab.style( "font-size", "24px" );
		lab.style( "font-weight", "bold" );
		lab.style( "text-align", "center" );
	}

	function setupInterface()
	{
		const w = WIDTH;
		const h = HEIGHT;

		// Any way to fix this for different devices?
		phys_unit = 60;

		if( ih_slider == null ) {
			ih_slider = p5c.createSlider( 0, 80, 0, 1 );
			ih_slider.input( tilingTypeChanged );
		}
		ih_slider.position( WIDTH/2 + 20, 15 );
		ih_slider.style( "width", "" + (WIDTH/2-100) + "px" );

		if( ih_label == null ) {
			ih_label = p5c.createSpan( "IH01" );
		}
		ih_label.position( WIDTH - 70, 10 );
		setLabelStyle( ih_label );

		if( A_slider == null ) {
			A_slider = p5c.createSlider( 0, 20, 1, 1 );
			A_slider.input( spiralChanged );
		}
		A_slider.position( WIDTH/2 + 20, HEIGHT/2 - 80 );
		A_slider.style( "width", "" + (WIDTH/2-100) + "px" );

		if( A_label == null ) {
			A_label = p5c.createSpan( "A: 1" );
		}
		A_label.position( WIDTH - 70, HEIGHT/2 - 85 );
		setLabelStyle( A_label );

		if( B_slider == null ) {
			B_slider = p5c.createSlider( 0, 20, 5, 1 );
			B_slider.input( spiralChanged );
		}
		B_slider.position( WIDTH/2 + 20, HEIGHT/2 - 50 );
		B_slider.style( "width", "" + (WIDTH/2-100) + "px" );

		if( B_label == null ) {
			B_label = p5c.createSpan( "B: 5" );
		}
		B_label.position( WIDTH - 70, HEIGHT/2 - 55 );
		setLabelStyle( B_label );

		edit_box = makeBox( 150, 50, WIDTH/2-200, HEIGHT/2-100 );

		if( tv_sliders != null ) {
			let yy = 50;
			for( let sl of tv_sliders ) {
				sl.position( WIDTH/2 + 20, yy );
				sl.style( "width", "" + (WIDTH/2-100) + "px" );
				yy += 30;
			}
		}

		if( help_button == null ) {
			help_button = p5c.createButton( "Help!" );
			help_button.mousePressed( doHelp );
		}
		help_button.size( 90, 30 );
		help_button.position( 10, 130 );

		if( fullscreen_button == null ) {
			fullscreen_button = p5c.createButton( "Fullscreen" );
			fullscreen_button.mousePressed( toggleFullscreen );
		}
		fullscreen_button.size( 90, 30 );
		fullscreen_button.position( 10, 10 );

		if ( colour_button == null ) {
			colour_button = p5c.createButton( "Colour" );
			colour_button.mousePressed( toggleColour );
		}
		colour_button.size( 90, 30 );
		colour_button.position( 10, 50 );

		if( animate_button == null ) {
			animate_button = p5c.createButton( "Animate" );
			animate_button.mousePressed( toggleAnimation );
		}
		animate_button.size( 90, 30 );
		animate_button.position( 10, 90 );

		if( save_button == null ) {
			save_button = p5c.createButton( "Save" );
			save_button.mousePressed( doSave );
		}
		save_button.size( 90, 30 );
		save_button.position( 10, 170 );
	}

	function doSave()
	{
		const getSvgFile = ( s, svg ) =>
			s.serializeToString( svg ).split( '\n' );

		const svg = getSpiralTilingSVG();
		const svgFile = getSvgFile( new XMLSerializer(), svg );
		p5c.save( svgFile, "spiral", "svg" );
	}

	function getSpiralTilingSVG()
	{
		colouring = colour ? min_colouring : uniform_colouring;

/*
		const r1 = Permutation.rank( colouring.p1 );
		const r2 = Permutation.rank( colouring.p2 );
	*/
		const r1 = colouring.p1rank;
		const r2 = colouring.p2rank;

		const t1 = tiling.getT1();
		const t2 = tiling.getT2();

		let svgElement = document.createElementNS( XMLNS, 'svg' );
		let g = document.createElementNS( XMLNS, 'g' );

		svgElement.setAttribute( 'xmlns:xlink', XLINK );
		svgElement.setAttribute( 'height', HEIGHT );
		svgElement.setAttribute( 'width', WIDTH );

		svgElement.appendChild( getSpiralUnitSVG() );

		// TODO(nikihasrati): Fix small tilings in centre.

		let i_i = spiral_A === 0 ? -spiral_B : -8 * r1 * spiral_A;
		let i_f = spiral_A === 0 ? spiral_B : 5 * r1 * spiral_A;
		let j_i = spiral_B === 0 ? -spiral_A : 1;
		let j_f = spiral_B === 0 ? spiral_A : r2 * spiral_B;

		for ( let i = i_i; i <= i_f; i++ ) {
			for ( let j = j_i; j <= j_f; j++ ) {
				let unit = document.createElementNS( XMLNS, 'use' );
				unit.setAttribute( 'xlink:href', '#spiral-unit' );

				let v = { x: i*t1.x + j*t2.x, y: i*t1.y + j*t2.y };
				let vp = mul( tiling_T, v );
				let s = Math.exp( vp.x );
				let r = p5c.degrees( vp.y );

				unit.setAttribute( 'transform', `scale(${s} ${s}) rotate(${r})` );
				g.appendChild( unit );
			}
		}

		const s = HEIGHT / p5c.TWO_PI;
		const tx = WIDTH / 2;
		const ty = HEIGHT / 2;
		g.setAttribute( 'transform', `translate(${tx}, ${ty}) scale(${s}, ${s})` );
		svgElement.appendChild( g );

		return svgElement;
	}

	// Return an SVG definition of a spiral translation unit.
	function getSpiralUnitSVG()
	{
		let defs = document.createElementNS( XMLNS, 'defs' );
		let symbol = document.createElementNS( XMLNS, 'symbol' );
		let g = document.createElementNS( XMLNS, 'g' );

		symbol.setAttribute('id', 'spiral-unit');
		symbol.setAttribute('overflow', 'visible');

		for ( let i = 0; i < tiling.numAspects(); i++ ) {
			let T = tiling.getAspectTransform( i );
			let tile = getSpiralSVG( T );
			// TODO(nikihasrati): Add colouring when colour is toggled on.
			tile.setAttribute( 'fill', 'none' );
			g.appendChild( tile );
		}

		symbol.appendChild( g );
		defs.appendChild( symbol );

		return defs;
	}

	// Return an SVG path representing the spiral tiling aspect with transformation T.
	function getSpiralSVG( T )
	{
		// Return the spiral coordinates of point v.
		function spiral( v ) {
			return {
				x: +( Math.exp(v.x) * Math.cos(v.y) ),
				y: +( Math.exp(v.x) * Math.sin(v.y) )}
		}

		// Return the point that divides the line segment from v1 to v2 into ratio m:n.
		function section( v1, v2, m, n ) {
			return {
				x: ( m*v1.x + n*v2.x ) / ( m + n ),
				y: ( m*v1.y + n*v2.y ) / ( m + n )
			}
		}

		// Return sample points from tiling edge.
		function sample_edge( v1, v2, n ) {
			let pts = [];
			for ( let i = 0; i <= n; i++ ) {
				let p = spiral( section( v1, v2, n - i, i ) );
				pts.push( [ p.x, p.y ] );
			}
			return pts;
		}

		// Apply the aspect transformation to the prototile.
		let vs = [ ...tile_shape, tile_shape[0] ];
		vs = vs.map( v => mul( T, v ) );

		// Make bezier curves to represent each edge of the spiral tile.
		let curves = [];
		for (let i = 0; i < vs.length - 1; i++ ) {
			let v1 = mul( tiling_T, vs[ i ] );
			let v2 = mul( tiling_T, vs[ i+1 ] );
			let edge_curves = sample_edge( v1, v2, 32 );
			let bezierCurves = fitCurve( edge_curves, 50 );
			curves.push(...bezierCurves);
		}

		// Create SVG string representation of bezier curves.
		let d = [`M ${curves[0][0][0]} ${curves[0][0][1]}`];
		for ( let c of curves ) {
			d.push(`C ${c[1][0]} ${c[1][1]}, ${c[2][0]} ${c[2][1]}, ${c[3][0]} ${c[3][1]}`)
		}

		let path = document.createElementNS( XMLNS, 'path' );
		path.setAttribute('d', d.join(' '));
		path.setAttribute('stroke', 'black');
		path.setAttribute('fill', 'none');
		path.setAttribute('vector-effect', 'non-scaling-stroke');

		return path;
	}

	function doHelp()
	{
		window.open( "https://isohedral.ca" );
	}

	function toggleFullscreen()
	{
		fullscreen = !fullscreen;
		let elts = [
			ih_slider, ih_label, A_slider, A_label, B_slider, B_label,
			help_button, fullscreen_button, colour_button, animate_button, save_button ].concat(
				tv_sliders );

		for( let elt of elts ) {
			if( elt != null ) {
				if( fullscreen ) {
					elt.hide();
				} else {
					elt.show();
				}
			}
		}

		fullscreen_button.show();
		if( fullscreen ) {
			fullscreen_button.html( "Fullscreen Off" );
		} else {
			fullscreen_button.html( "Fullscreen" );
		}

		p5c.loop();
		return false;
	}

	function toggleColour()
	{
		colour = !colour;

		drawTranslationalUnit();
		p5c.loop();
	}

	function toggleAnimation()
	{
		animating = !animating;
		if( animating ) {
			p5c.loop();
		}
	}

	p5c.setup = function()
	{
		WIDTH = window.innerWidth;
		HEIGHT = window.innerHeight;

		let canvas = p5c.createCanvas( WIDTH, HEIGHT, p5c.WEBGL );
		canvas.parent( "sktch" );

		p5c.textFont( fnt );

		const asp = WIDTH / HEIGHT;
		const hh = 6.0;
		const ww = asp * hh;
		const sc = HEIGHT / (2*hh);

		setupInterface();

		the_type = 0;
		const tp = tilingTypes[ the_type ];
		tiling = new IsohedralTiling( tp );

		setTilingType();

		p5c.textureWrap( p5c.REPEAT );
		p5c.textureMode( p5c.NORMAL );
	}

	p5c.windowResized = function()
	{
		WIDTH = window.innerWidth;
		HEIGHT = window.innerHeight;

		p5c.resizeCanvas( WIDTH, HEIGHT );
		setupInterface();
		calculateTilingTransform();
		p5c.loop();
	}

	p5c.draw = function()
	{
		p5c.background( 255 );
		p5c.push();
		p5c.translate( -p5c.width/2, -p5c.height/2 );

		if( animating ) {
			const t1 = mul( tiling_T, tiling.getT1() );
			t1.x -= tiling_T[2];
			t1.y -= tiling_T[5];
			const l = len( t1 );
			calculateTilingTransform();
			tiling_V.x -= 0.01 * t1.x / l;
			tiling_V.y -= 0.01 * t1.y / l;
		}

		// FIXME -- why doesn't this work if the spiral comes after the tiling?
		if( !fullscreen ) {
			drawEditor();
		}

		drawSpiral();

		if( !fullscreen ) {
			drawTiling();
		}
		p5c.pop();

	/*
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
		*/

		if( !animating ) {
			p5c.noLoop();
		}
	}
};

let myp5 = new p5( sktch, 'sketch0' );
