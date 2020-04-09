/*
 * Tactile-JS
 * Copyright 2018 Craig S. Kaplan, csk@uwaterloo.ca
 *
 * Distributed under the terms of the 3-clause BSD license.  See the
 * file "LICENSE" for more information.
 */

'use strict'

const EdgeShape = {
	J : 10001,
	U : 10002,
	S : 10003,
	I : 10004,
};

const numTypes = 81;

function mul( A, B ) 
{
	if( B.hasOwnProperty( 'x' ) ) {
		// Matrix * Point
		return { 
			x : A[0]*B.x + A[1]*B.y + A[2],
			y : A[3]*B.x + A[4]*B.y + A[5] };
	} else {
		// Matrix * Matrix
		return [A[0]*B[0] + A[1]*B[3], 
			A[0]*B[1] + A[1]*B[4],
			A[0]*B[2] + A[1]*B[5] + A[2],

			A[3]*B[0] + A[4]*B[3], 
			A[3]*B[1] + A[4]*B[4],
			A[3]*B[2] + A[4]*B[5] + A[5]];
	}
};

function matchSeg( p, q )
{
	return [q.x-p.x, p.y-q.y, p.x,  q.y-p.y, q.x-p.x, p.y];
};
