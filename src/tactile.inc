function makePoint( coeffs, offs, params )
{
	let ret = { x : 0.0, y : 0.0 }

	for( let i = 0; i < params.length; ++i ) {
		ret.x += coeffs[offs+i] * params[i];
		ret.y += coeffs[offs+params.length+i] * params[i];
	}

	return ret;
};

function makeMatrix( coeffs, offs, params )
{
	let ret = []

	for( let row = 0; row < 2; ++row ) {
		for( let col = 0; col < 3; ++col ) {
			let val = 0.0;
			for( let idx = 0; idx < params.length; ++idx ) {
				val += coeffs[offs+idx] * params[idx];
			}
			ret.push( val );
			offs += params.length;
		}
	}

	return ret;
};

const M_orients = [
	[1.0, 0.0, 0.0,    0.0, 1.0, 0.0],   // IDENTITY
	[-1.0, 0.0, 1.0,   0.0, -1.0, 0.0],  // ROT
	[-1.0, 0.0, 1.0,   0.0, 1.0, 0.0],   // FLIP
	[1.0, 0.0, 0.0,    0.0, -1.0, 0.0]   // ROFL
];

const TSPI_U = [
	[0.5, 0.0, 0.0,    0.0, 0.5, 0.0],
	[-0.5, 0.0, 1.0,   0.0, 0.5, 0.0]
];

const TSPI_S = [
	[0.5, 0.0, 0.0,    0.0, 0.5, 0.0],
	[-0.5, 0.0, 1.0,   0.0, -0.5, 0.0]
];

class IsohedralTiling
{
	constructor( tp )
	{
		this.reset( tp );
	}

	reset( tp )
	{
		this.tiling_type = tp;
		this.ttd = tiling_type_data[ tp ];
		this.parameters = this.ttd.default_params.slice( 0 );
		this.parameters.push( 1.0 );
		this.recompute();
	}

	recompute()
	{
		const ntv = this.numVertices();
		const np = this.numParameters();
		const na = this.numAspects();

		// Recompute tiling vertex locations.
		this.verts = [];
		for( let idx = 0; idx < ntv; ++idx ) {
			this.verts.push( makePoint( this.ttd.vertex_coeffs,
				idx * (2 * (np + 1)), this.parameters ) );
		}

		// Recompute edge transforms and reversals from orientation information.
		this.reversals = [];
		this.edges = []
		for( let idx = 0; idx < ntv; ++idx ) {
			const fl = this.ttd.edge_orientations[2*idx];
			const ro = this.ttd.edge_orientations[2*idx+1];
			this.reversals.push( fl != ro );
			this.edges.push( 
				mul( matchSeg( this.verts[idx], this.verts[(idx+1)%ntv] ),
				M_orients[2*fl+ro] ) );
		}

		// Recompute aspect xforms.
		this.aspects = []
		for( let idx = 0; idx < na; ++idx ) {
			this.aspects.push( 
				makeMatrix( this.ttd.aspect_coeffs, 6*(np+1)*idx,
					this.parameters ) );
		}
					
		// Recompute translation vectors.
		this.t1 = makePoint(
			this.ttd.translation_coeffs, 0, this.parameters );
		this.t2 = makePoint(
			this.ttd.translation_coeffs, 2*(np+1), this.parameters );
	}

	getTilingType()
	{
		return this.tiling_type;
	}

	numParameters()
	{
		return this.ttd.num_params;
	}

	setParameters( arr )
	{
		if( arr.length == (this.parameters.length-1) ) {
			this.parameters = arr.slice( 0 );
			this.parameters.push( 1.0 );
			this.recompute();
		}
	}

	getParameters()
	{
		return this.parameters.slice( 0, -1 );
	}

	numEdgeShapes()
	{
		return this.ttd.num_edge_shapes;
	}

	getEdgeShape( idx )
	{
		return this.ttd.edge_shapes[ idx ];
	}

	* shape()
	{
		for( let idx = 0; idx < this.numVertices(); ++idx ) {
			const an_id = this.ttd.edge_shape_ids[idx];

			yield {
				T : this.edges[idx],
				id : an_id,
				shape : this.ttd.edge_shapes[ an_id ],
				rev : this.reversals[ idx ]
			};
		}
	}

	* parts()
	{
		for( let idx = 0; idx < this.numVertices(); ++idx ) {
			const an_id = this.ttd.edge_shape_ids[idx];
			const shp = this.ttd.edge_shapes[an_id];

			if( (shp == EdgeShape.J) || (shp == EdgeShape.I) ) {
				yield {
					T : this.edges[idx],
					id : an_id,
					shape : shp,
					rev : this.reversals[ idx ],
					second : false
				};
			} else {
				const indices = this.reversals[idx] ? [1,0] : [0,1];
				const Ms = (shp == EdgeShape.U) ? TSPI_U : TSPI_S;

				yield {
					T : mul( this.edges[idx], Ms[indices[0]] ),
					id : an_id,
					shape : shp,
					rev : false,
					second : false
				};
				
				yield {
					T : mul( this.edges[idx], Ms[indices[1]] ),
					id : an_id,
					shape : shp,
					rev : true,
					second : true
				};
			}
		}
	}

	numVertices()
	{
		return this.ttd.num_vertices;
	}

	getVertex( idx )
	{
		return { ...this.verts[ idx ] };
	}

	vertices()
	{
		return this.verts.map( v => ({ ...v }) );
	}

	numAspects()
	{
		return this.ttd.num_aspects;
	}
	
	getAspectTransform( idx )
	{
		return [ ...this.aspects[ idx ] ];
	}

	getT1()
	{
		return { ...this.t1 };
	}

	getT2()
	{
		return { ...this.t2 };
	}

	* fillRegionBounds( xmin, ymin, xmax, ymax )
	{
		yield* this.fillRegionQuad(
			{ x : xmin, y : ymin },
			{ x : xmax, y : ymin },
			{ x : xmax, y : ymax },
			{ x : xmin, y : ymax } );
	}

	* fillRegionQuad( A, B, C, D )
	{
		const t1 = this.getT1();
		const t2 = this.getT2();
		const ttd = this.ttd;
		const aspects = this.aspects;

		let last_y;

		function bc( M, p ) {
			return { 
				x : M[0]*p.x + M[1]*p.y,
				y : M[2]*p.x + M[3]*p.y };
		};

		function sampleAtHeight( P, Q, y )
		{
			const t = (y-P.y)/(Q.y-P.y);
			return { x : (1.0-t)*P.x + t*Q.x, y : y };
		}

		function* doFill( A, B, C, D, do_top )
		{
			let x1 = A.x;
			const dx1 = (D.x-A.x)/(D.y-A.y);
			let x2 = B.x;
			const dx2 = (C.x-B.x)/(C.y-B.y);
			const ymin = A.y;
			let ymax = C.y;

			if( do_top ) {
				ymax = ymax + 1.0;
			}

			let y = Math.floor( ymin );
			if( last_y ) {
				y = Math.max( last_y, y );
			}

			while( y < ymax ) {
				const yi = Math.trunc( y );
				let x = Math.floor( x1 );
				while( x < (x2 + 1e-7) ) {
					const xi = Math.trunc( x );

					for( let asp = 0; asp < ttd.num_aspects; ++asp ) {
						let M = aspects[ asp ].slice( 0 );
						M[2] += xi*t1.x + yi*t2.x;
						M[5] += xi*t1.y + yi*t2.y;

						yield {
							T : M,
							t1 : xi,
							t2 : yi,
							aspect : asp
						};
					}

					x += 1.0;
				}
				x1 += dx1;
				x2 += dx2;
				y += 1.0;
			}

			last_y = y;
		}

		function* fillFixX( A, B, C, D, do_top )
		{
			if( A.x > B.x ) {
				yield* doFill( B, A, D, C, do_top );
			} else {
				yield* doFill( A, B, C, D, do_top );
			}
		}
			
		function* fillFixY( A, B, C, D, do_top ) 
		{
			if( A.y > C.y ) {
				yield* doFill( C, D, A, B, do_top );
			} else {
				yield* doFill( A, B, C, D, do_top );
			}
		}

		const det = 1.0 / (t1.x*t2.y-t2.x*t1.y);
		const Mbc = [ t2.y * det, -t2.x * det, -t1.y * det, t1.x * det ];

		let pts = [ bc( Mbc, A ), bc( Mbc, B ), bc( Mbc, C ), bc( Mbc, D ) ];

		if( det < 0.0 ) {
			let tmp = pts[1];
			pts[1] = pts[3];
			pts[3] = tmp;
		}

		if( Math.abs( pts[0].y - pts[1].y ) < 1e-7 ) {
			yield* fillFixY( pts[0], pts[1], pts[2], pts[3], true );
		} else if( Math.abs( pts[1].y - pts[2].y ) < 1e-7 ) {
			yield* fillFixY( pts[1], pts[2], pts[3], pts[0], true );
		} else {
			let lowest = 0;
			for( let idx = 1; idx < 4; ++idx ) {
				if( pts[idx].y < pts[lowest].y ) {
					lowest = idx;
				}
			}

			let bottom = pts[lowest];
			let left = pts[(lowest+1)%4];
			let top = pts[(lowest+2)%4];
			let right = pts[(lowest+3)%4];

			if( left.x > right.x ) {
				let tmp = left;
				left = right;
				right = tmp;
			}

			if( left.y < right.y ) {
				const r1 = sampleAtHeight( bottom, right, left.y );
				const l2 = sampleAtHeight( left, top, right.y );
				yield* fillFixX( bottom, bottom, r1, left, false );
				yield* fillFixX( left, r1, right, l2, false );
				yield* fillFixX( l2, right, top, top, true );
			} else {
				const l1 = sampleAtHeight( bottom, left, right.y );
				const r2 = sampleAtHeight( right, top, left.y );
				yield* fillFixX( bottom, bottom, right, l1, false );
				yield* fillFixX( l1, right, r2, left, false );
				yield* fillFixX( left, r2, top, top, true );
			}
		}
	}
	
	getColour( a, b, asp )
	{
		const clrg = this.ttd.colouring;
		const nc = clrg[18];

		let mt1 = a % nc;
		if( mt1 < 0 ) {
			mt1 += nc;
		}
		let mt2 = b % nc;
		if( mt2 < 0 ) {
			mt2 += nc;
		}
		let col = clrg[asp];

		for( let idx = 0; idx < mt1; ++idx ) {
			col = clrg[12+col];
		}
		for( let idx = 0; idx < mt2; ++idx ) {
			col = clrg[15+col];
		}

		return col;
	}
};

export 
{
	EdgeShape,

	numTypes,
	tilingTypes,

	makePoint,
	makeMatrix,
	mul,
	matchSeg,

	IsohedralTiling
};
