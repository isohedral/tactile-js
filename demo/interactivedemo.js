/*
 * Tactile-JS
 * Copyright 2018 Craig S. Kaplan, csk@uwaterloo.ca
 *
 * Distributed under the terms of the 3-clause BSD license.  See the
 * file "LICENSE" for more information.
 */

// A port of the Tactile C++ demo program to P5.js.

import { makeBox, EditableTiling } from './tileinfo.js';
import { mul, EdgeShape, numTypes, tilingTypes, IsohedralTiling } 
	from '../lib/tactile.js';

let sktch = function( p5c )
{
	const editor_box = makeBox( 10, 350, 200, 240 );
	const phys_unit = 60;

	let QS = null;
	let vals = null;

	let editor_pane = null;
	let show_controls = true;
	let zoom = 1.0;

	let the_type = null;
	let tiling = null;

	let dragging = null;

	const COLS = [
		[ 25, 52, 65 ],
		[ 62, 96, 111 ],
		[ 145, 170, 157 ],
		[ 209, 219, 189 ],
		[ 252, 255, 245 ],
		[ 219, 188, 209 ] ];

	function setTilingType()
	{
		const tp = tilingTypes[ the_type ];
		tiling.setType( tp );

		let title = "Tiling: IH";
		if( tp < 10 ) {
			title += "0";
		}
		title += tp;

		// I'd like to say this: QS.setTitle( title );
		// QuickSettings doesn't include a public API for setting the
		// title of a panel, so reach into the guts and twiddle the
		// data directly.
		QS._titleBar.textContent = title;

		const np = tiling.numParams();
		let vals = {};
		for( let idx = 0; idx < 6; ++idx ) {
			if( idx < np ) {
				QS.showControl( "v" + idx );
				vals["v"+idx] = tiling.getParam( idx );
			} else {
				QS.hideControl( "v" + idx );
			}
		}
		QS.setValuesFromJSON( vals );
	}

	function nextTilingType()
	{
		if( the_type < (numTypes-1) ) {
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

	function drawTiling()
	{
		const asp = p5c.width / p5c.height;
		const h = 6.0 * zoom;
		const w = asp * h * zoom;
		const sc = p5c.height / (2*h);
		const M = mul(
			[1, 0, p5c.width/2.0, 0, 1, p5c.height/2.0],
			[sc, 0, 0, 0, -sc, 0] );

		p5c.stroke( COLS[0][0], COLS[0][1], COLS[0][2] );
		p5c.strokeWeight( 1.0 );

		const proto = tiling.getPrototile();

		for( let i of proto.fillRegionBounds(-w-2.0, -h-2.0, w+2.0, h+2.0) ) {
			const TT = i.T;
			const T = mul( M, TT );

			const col = COLS[ proto.getColour( i.t1, i.t2, i.aspect ) + 1 ];
			p5c.fill( col[0], col[1], col[2] );

			p5c.beginShape();
			for( let v of tiling.getTileShape() ) {
				const P = mul( T, v );
				p5c.vertex( P.x, P.y );
			}
			p5c.endShape( p5c.CLOSE );
		}
	}

	function drawEditor()
	{
		let pg = editor_pane;
		pg.clear();

		pg.fill( 252, 255, 254, 220 );
		pg.noStroke();
		pg.rect( 0, 0, editor_box.w, editor_box.h );

		pg.strokeWeight( 2.0 );
		pg.fill( COLS[3][0], COLS[3][1], COLS[3][2] );

		const ET = tiling.getEditorTransform();
		const proto = tiling.getPrototile();

		pg.beginShape();
		for( let v of tiling.getTileShape() ) {
			const P = mul( ET, v );
			pg.vertex( P.x, P.y );
		}
		pg.endShape( p5c.CLOSE );

		pg.noFill();

		// Draw edges
		for( let i of proto.parts() ) {
			if( i.shape == EdgeShape.I ) {
				pg.stroke( 158 );
			} else {
				pg.stroke( 0 );
			}

			const M = mul( ET, i.T );
			pg.beginShape();
			for( let v of tiling.getEdgeShape( i.id ) ) {
				const P = mul( M, v );
				pg.vertex( P.x, P.y );
			}
			pg.endShape();
		}

		// Draw tiling vertices
		pg.noStroke();
		pg.fill( 158 );
		for( let v of proto.vertices() ) {
			const pt = mul( ET, v );
			pg.ellipse( pt.x, pt.y, 10.0, 10.0 );
		}

		// Draw editable vertices
		for( let i of proto.parts() ) {
			const shp = i.shape;
			const id = i.id;
			const ej = tiling.getEdgeShape( id );
			const T = mul( ET, i.T );

			for( let idx = 1; idx < ej.length - 1; ++idx ) {
				pg.fill( 0 );
				const pt = mul( T, ej[idx] );
				pg.ellipse( pt.x, pt.y, 10.0, 10.0 );
			}

			if( shp == EdgeShape.I || shp == EdgeShape.J ) {
				continue;
			}

			// Draw symmetry points for U and S edges.
			if( !i.second ) {
				if( shp == EdgeShape.U ) {
					pg.fill( COLS[2][0], COLS[2][1], COLS[2][2] );
				} else {
					pg.fill( COLS[5][0], COLS[5][1], COLS[5][2] );
				}
				const pt = mul( T, ej[ej.length-1] );
				pg.ellipse( pt.x, pt.y, 10.0, 10.0 );
			}
		}

		p5c.image( pg, editor_box.x, editor_box.y );

		p5c.strokeWeight( 3.0 );
		p5c.stroke( 25, 52, 65, 220 );
		p5c.noFill();
		p5c.rect( editor_box.x, editor_box.y, editor_box.w, editor_box.h );
	}

	function slide()
	{
		let params = []
		vals = QS.getValuesAsJSON();
		for( let idx = 0; idx < tiling.numParams(); ++idx ) {
			params.push( vals[ "v" + idx ] );
		}
		tiling.setParams( params );
		p5c.loop();
	}

	p5c.mouseDragged = function()
	{
		if( dragging ) {
			const npt = 
				{ x: p5c.mouseX - editor_box.x, y: p5c.mouseY - editor_box.y };
			tiling.moveEdit( npt );
			p5c.loop();
			return false;
		}
	}

	p5c.mousePressed = function()
	{
		dragging = false;
		if( !show_controls ) {
			return;
		}

		const pt = {
			x: p5c.mouseX - editor_box.x, y: p5c.mouseY - editor_box.y };

		if( (pt.x < 0) || (pt.x > editor_box.w) ) {
			return;
		}
		if( (pt.y < 0) || (pt.y > editor_box.h) ) {
			return;
		}

		if( tiling.startEdit( pt, p5c.keyIsDown( p5c.SHIFT ) ) ) {
			dragging = true;
			p5c.loop();
		} else {
			tiling.calcEditorTransform();
			p5c.loop();
		}
	}

	p5c.mouseReleased = function()
	{
		tiling.finishEdit();
		dragging = false;
	}

	p5c.keyPressed = function()
	{
		if( p5c.keyCode === p5c.RIGHT_ARROW ) {
			nextTilingType();
			p5c.loop();
		} else if( p5c.keyCode === p5c.LEFT_ARROW ) {
			prevTilingType();
			p5c.loop();
		} else if( p5c.key == ' ' ) {
			show_controls = !show_controls;
			if( show_controls ) {
				QS.expand();
			} else {
				QS.collapse();
			}
			p5c.loop();
		} else if( p5c.key == ',' || p5c.key == '<' ) {
			zoom /= 0.9;
			p5c.loop();
		} else if( p5c.key == '.' || p5c.key == '>' ) {
			zoom *= 0.9;
			p5c.loop();
		}
	}

	p5c.setup = function()
	{
		let canvas = p5c.createCanvas( 800, 600 );
		canvas.parent( "sktch" );

		tiling = new EditableTiling( editor_box.w, editor_box.h, phys_unit );

		let res = document.getElementById( "sktch" ).getBoundingClientRect();
		QS = QuickSettings.create(
			res.left + window.scrollX + 10, res.top + window.scrollY + 10, 
			"Tiling: IH01" );
		for( let idx = 0; idx < 6; ++idx ) {
			QS.addRange( "v" + idx, 0, 2, 1, 0.0001, null );
			QS.hideControl( "v" + idx );
		}

		editor_pane = p5c.createGraphics( editor_box.w, editor_box.h );

		QS.setGlobalChangeHandler( slide );
		the_type = 0;
		setTilingType();
	}

	p5c.draw = function()
	{
		p5c.background( 255 );

		drawTiling();

		if( show_controls ) {
			drawEditor();
		}

		p5c.noLoop();
	}
}

let myp5 = new p5( sktch, 'sketch0' );
