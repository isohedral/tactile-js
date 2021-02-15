/*
 * Tactile-JS
 * Copyright 2018 Craig S. Kaplan, csk@uwaterloo.ca
 *
 * Distributed under the terms of the 3-clause BSD license.  See the
 * file "LICENSE" for more information.
 */

import { mul, matchSeg, EdgeShape, numTypes, tilingTypes, IsohedralTiling } 
	from '../lib/tactile.js';

let sktch = function( p5c )
{
	let cur_tiling = null;
	let next_tiling = null;
	let last_change = 0.0;

	function sub( V, W ) { return { x: V.x-W.x, y: V.y-W.y }; };
	function dot( V, W ) { return V.x*W.x + V.y*W.y; };
	function len( V ) { return p5c.sqrt( dot( V, V ) ); }

	function inv( T ) {
		const det = T[0]*T[4] - T[1]*T[3];
		return [T[4]/det, -T[1]/det, (T[1]*T[5]-T[2]*T[4])/det,
			-T[3]/det, T[0]/det, (T[2]*T[3]-T[0]*T[5])/det];
	};

	function createRandomTiling()
	{
		const tp = tilingTypes[ Math.floor( 81 * p5c.random() ) ];

		let tiling = new IsohedralTiling( tp );
		let ps = tiling.getParameters();
		for( let i = 0; i < ps.length; ++i ) {
			ps[i] += p5c.random() * 0.3 - 0.15;
		}
		tiling.setParameters( ps );

		let edges = [];
		for( let i = 0; i < tiling.numEdgeShapes(); ++i ) {
			let ej = [];
			const shp = tiling.getEdgeShape( i );
			if( shp == EdgeShape.I ) {
				// Pass
			} else if( shp == EdgeShape.J ) {
				ej.push( { x: Math.random()*0.6, y : Math.random() - 0.5 } );
				ej.push( { x: Math.random()*0.6 + 0.4, y : Math.random() - 0.5 } );
			} else if( shp == EdgeShape.S ) {
				ej.push( { x: Math.random()*0.6, y : Math.random() - 0.5 } );
				ej.push( { x: 1.0 - ej[0].x, y: -ej[0].y } );
			} else if( shp == EdgeShape.U ) {
				ej.push( { x: Math.random()*0.6, y : Math.random() - 0.5 } );
				ej.push( { x: 1.0 - ej[0].x, y: ej[0].y } );
			}

			edges.push( ej );
		}

		let cols = [];
		for( let i = 0; i < 3; ++i ) {
			cols.push( [
				Math.floor( Math.random() * 255.0 ), 
				Math.floor( Math.random() * 255.0 ), 
				Math.floor( Math.random() * 255.0 ) ] );
		}

		const dtheta = Math.random() * p5c.TWO_PI;
		const dv = Math.random() * 0.05;

		return {
			tiling: tiling,
			edges: edges,
			cols: cols,

			tx: Math.random() * 10.0,
			ty: Math.random() * 10.0,
			theta: Math.random() * p5c.TWO_PI,
			sc: Math.random() * 20.0 + 4.0,

			dx: dv * Math.cos( dtheta ),
			dy: dv * Math.sin( dtheta )
		};
	}

	function samp( O, V, W, a, b )
	{
		return { 
			x: O.x + a * V.x + b * W.x,
			y: O.y + a * V.y + b * W.y };
	}

	function tvertex( T, p )
	{
		const P = mul( T, p );
		p5c.vertex( P.x, P.y );
	}

	function tbezier( T, ax, ay, bx, by, cx, cy )
	{
		const A = mul( T, { x: ax, y: ay } );
		const B = mul( T, { x: bx, y: by } );
		const C = mul( T, { x: cx, y: cy } );
		p5c.bezierVertex( A.x, A.y, B.x, B.y, C.x, C.y );
	}

	function drawTiling( T, alpha )
	{
		const c = Math.cos( T.theta );
		const s = Math.sin( T.theta );

		const O = { x: T.tx, y: T.ty };
		const V = { x: c, y: s };
		const W = { x: -s, y: c };

		const t1l = len( T.tiling.getT1() );
		const t2l = len( T.tiling.getT2() );
		const marg = 1.5 * p5c.sqrt( t1l*t1l + t2l*t2l );

		const pts = [
			samp( O, V, W, -marg, -marg ),
			samp( O, V, W, T.sc + marg, -marg ),
			samp( O, V, W, T.sc + marg, T.sc * (p5c.height/p5c.width) + marg ),
			samp( O, V, W, -marg, T.sc * (p5c.height/p5c.width) + marg ),
		];
		
		const M = mul( 
			[ p5c.width, 0.0, 0.0, 0.0, p5c.width, 0.0 ],
			inv( matchSeg( O, samp( O, V, W, T.sc, 0.0 ) ) ) );

		p5c.stroke( 0, alpha );
		p5c.strokeWeight( 1.0 );
		p5c.strokeJoin( p5c.ROUND );
		p5c.strokeCap( p5c.ROUND );

		for( let i of T.tiling.fillRegionQuad( pts[0], pts[1], pts[2], pts[3] ) ) {
			const TT = i.T;
			const CT = mul( M, TT );

			const col = T.cols[ T.tiling.getColour( i.t1, i.t2, i.aspect ) ];
			p5c.fill( col[0], col[1], col[2], alpha );

			p5c.beginShape();
			tvertex( CT, T.tiling.getVertex( 0 ) );

			for( let si of T.tiling.shape() ) {
				const S = mul( CT, si.T );
				if( si.shape == EdgeShape.I ) {
					tvertex( S, { x: si.rev ? 0.0 : 1.0, y: 0.0 } );
				} else {
					const ej = T.edges[si.id];
					if( si.rev ) {
						tbezier( S, ej[1].x, ej[1].y, ej[0].x, ej[0].y, 0.0, 0.0 );
					} else {
						tbezier( S, ej[0].x, ej[0].y, ej[1].x, ej[1].y, 1.0, 0.0 );
					}
				}
			}
			p5c.endShape( p5c.CLOSE );
		}
	}

	p5c.setup = function()
	{
		const clientWidth = document.getElementById('sktch').clientWidth;
		const clientHeight = document.getElementById('sktch').clientHeight;

		let canvas = p5c.createCanvas( clientWidth, clientHeight );
		canvas.parent( "sktch" );

		cur_tiling = createRandomTiling();
		next_tiling = createRandomTiling();
	}

	p5c.draw = function()
	{
		p5c.background( 255 );

		const cur_time = p5c.millis();
		let delta = cur_time - last_change;

		if( delta > 6000 ) {
			cur_tiling = next_tiling;
			next_tiling = createRandomTiling();
			last_change = cur_time;
			delta = 0.0;
		} 

		drawTiling( cur_tiling, 255 );
		cur_tiling.tx += cur_tiling.dx;
		cur_tiling.ty += cur_tiling.dy;

		if( delta > 5000 ) {
			drawTiling( next_tiling, p5c.map( delta, 5000, 6000, 0, 255 ) );
			next_tiling.tx += next_tiling.dx;
			next_tiling.ty += next_tiling.dy;
		}
	}

	p5c.mousePressed = function()
	{
		cur_tiling = createRandomTiling();
	}
};

let myp5 = new p5( sktch, 'sketch0' );
