'use strict'

const Tactile = (function(window)
{

function buildLibrary()
{
	let tactile_lib = {
		J : 10001,
		U : 10002,
		S : 10003,
		I : 10004,

		num_types: 81
	};

	tactile_lib.mul = function( A, B )
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

