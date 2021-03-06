/* global tinymce */
tinymce.PluginManager.add( 'wpeditimage', function( editor ) {
	function parseShortcode( content ) {
		return content.replace( /(?:<p>)?\[(?:wp_)?caption([^\]]+)\]([\s\S]+?)\[\/(?:wp_)?caption\](?:<\/p>)?/g, function( a, b, c ) {
			var id, cls, w, cap, img, width,
				trim = tinymce.trim;

			id = b.match( /id=['"]([^'"]*)['"] ?/ );
			if ( id ) {
				b = b.replace( id[0], '' );
			}

			cls = b.match( /align=['"]([^'"]*)['"] ?/ );
			if ( cls ) {
				b = b.replace( cls[0], '' );
			}

			w = b.match( /width=['"]([0-9]*)['"] ?/ );
			if ( w ) {
				b = b.replace( w[0], '' );
			}

			c = trim( c );
			img = c.match( /((?:<a [^>]+>)?<img [^>]+>(?:<\/a>)?)([\s\S]*)/i );

			if ( img && img[2] ) {
				cap = trim( img[2] );
				img = trim( img[1] );
			} else {
				// old captions shortcode style
				cap = trim( b ).replace( /caption=['"]/, '' ).replace( /['"]$/, '' );
				img = c;
			}

			id = ( id && id[1] ) ? id[1] : '';
			cls = ( cls && cls[1] ) ? cls[1] : 'alignnone';

			if ( ! w && img ) {
				w = img.match( /width=['"]([0-9]*)['"]/ );
			}

			if ( w && w[1] ) {
				w = w[1];
			}

			if ( ! w || ! cap ) {
				return c;
			}

			width = parseInt( w, 10 );
			if ( ! editor.getParam( 'wpeditimage_html5_captions' ) ) {
				width += 10;
			}

			return '<div class="mceTemp"><dl id="'+ id +'" class="wp-caption '+ cls +'" style="width: '+ width +'px">' +
				'<dt class="wp-caption-dt">'+ img +'</dt><dd class="wp-caption-dd">'+ cap +'</dd></dl></div>';
		});
	}

	function getShortcode( content ) {
		return content.replace( /<div (?:id="attachment_|class="mceTemp)[^>]*>([\s\S]+?)<\/div>/g, function( a, b ) {
			var out = '';

			if ( b.indexOf('<img ') === -1 ) {
				// Broken caption. The user managed to drag the image out?
				// Try to return the caption text as a paragraph.
				out = b.match( /<dd [^>]+>([\s\S]+?)<\/dd>/i );

				if ( out && out[1] ) {
					return '<p>' + out[1] + '</p>';
				}

				return '';
			}

			out = b.replace( /<dl ([^>]+)>\s*<dt [^>]+>([\s\S]+?)<\/dt>\s*<dd [^>]+>([\s\S]*?)<\/dd>\s*<\/dl>/gi, function( a, b, c, cap ) {
				var id, cls, w;

				w = c.match( /width="([0-9]*)"/ );
				w = ( w && w[1] ) ? w[1] : '';

				if ( ! w || ! cap ) {
					return c;
				}

				id = b.match( /id="([^"]*)"/ );
				id = ( id && id[1] ) ? id[1] : '';

				cls = b.match( /class="([^"]*)"/ );
				cls = ( cls && cls[1] ) ? cls[1] : '';
				cls = cls.match( /align[a-z]+/ ) || 'alignnone';

				cap = cap.replace( /\r\n|\r/g, '\n' ).replace( /<[a-zA-Z0-9]+( [^<>]+)?>/g, function( a ) {
					// no line breaks inside HTML tags
					return a.replace( /[\r\n\t]+/, ' ' );
				});

				// convert remaining line breaks to <br>
				cap = cap.replace( /\s*\n\s*/g, '<br />' );

				return '[caption id="'+ id +'" align="'+ cls +'" width="'+ w +'"]'+ c +' '+ cap +'[/caption]';
			});

			if ( out.indexOf('[caption') !== 0 ) {
				// the caption html seems brocken, try to find the image that may be wrapped in a link
				// and may be followed by <p> with the caption text.
				out = b.replace( /[\s\S]*?((?:<a [^>]+>)?<img [^>]+>(?:<\/a>)?)(<p>[\s\S]*<\/p>)?[\s\S]*/gi, '<p>$1</p>$2' );
			}

			return out;
		});
	}

	function extractImageData( imageNode ) {
		var classes, metadata, captionBlock, caption,
			dom = editor.dom;

		// default attributes
		metadata = {
			attachment_id: false,
			url: false,
			height: '',
			width: '',
			size: 'none',
			caption: '',
			alt: '',
			align: 'none',
			link: false,
			linkUrl: ''
		};

		metadata.url = dom.getAttrib( imageNode, 'src' );
		metadata.alt = dom.getAttrib( imageNode, 'alt' );
		metadata.width = parseInt( dom.getAttrib( imageNode, 'width' ), 10 );
		metadata.height = parseInt( dom.getAttrib( imageNode, 'height' ), 10 );

		//TODO: probably should capture attributes on both the <img /> and the <a /> so that they can be restored
		// when the image and/or caption are updated
		// maybe use getAttribs()

		// extract meta data from classes (candidate for turning into a method)
		classes = imageNode.className.split( ' ' );
		tinymce.each( classes, function( name ) {

			if ( /^wp-image/.test( name ) ) {
				metadata.attachment_id = parseInt( name.replace( 'wp-image-', '' ), 10 );
			}

			if ( /^align/.test( name ) ) {
				metadata.align = name.replace( 'align', '' );
			}

			if ( /^size/.test( name ) ) {
				metadata.size = name.replace( 'size-', '' );
			}
		} );

		// extract caption
		captionBlock = dom.getParents( imageNode, '.wp-caption' );

		if ( captionBlock.length ) {
			captionBlock = captionBlock[0];

			classes = captionBlock.className.split( ' ' );
			tinymce.each( classes, function( name ) {
				if ( /^align/.test( name ) ) {
					metadata.align = name.replace( 'align', '' );
				}
			} );

			caption = dom.select( 'dd.wp-caption-dd', captionBlock );
			if ( caption.length ) {
				caption = caption[0];
				// need to do some more thinking about this
				metadata.caption = editor.serializer.serialize( caption )
					.replace( /<br[^>]*>/g, '$&\n' ).replace( /^<p>/, '' ).replace( /<\/p>$/, '' );
			}
		}

		// extract linkTo
		if ( imageNode.parentNode && imageNode.parentNode.nodeName === 'A' ) {
			metadata.linkUrl = dom.getAttrib( imageNode.parentNode, 'href' );
		}

		return metadata;
	}

	function updateImage( imageNode, imageData ) {
		var className, width, node, html, captionNode, nodeToReplace, uid, editedImg;

		if ( imageData.caption ) {

			html = createImageAndLink( imageData, 'html' );

			width = parseInt( imageData.width );

			if ( ! editor.getParam( 'wpeditimage_html5_captions' ) ) {
				width += 10;
			}

			className = 'align' + imageData.align;

			//TODO: shouldn't add the id attribute if it isn't an attachment

			// should create a new function for generating the caption markup
			html =  '<dl id="'+ imageData.attachment_id +'" class="wp-caption '+ className +'" style="width: '+ width +'px">' +
				'<dt class="wp-caption-dt">'+ html + '</dt><dd class="wp-caption-dd">'+ imageData.caption +'</dd></dl>';

			node = editor.dom.create( 'div', { 'class': 'mceTemp' }, html );
		} else {
			node = createImageAndLink( imageData, 'node' );
		}

		nodeToReplace = imageNode;

		captionNode = editor.dom.getParent( imageNode, '.mceTemp' );

		if ( captionNode ) {
			nodeToReplace = captionNode;
		} else {
			if ( imageNode.parentNode.nodeName === 'A' ) {
				nodeToReplace = imageNode.parentNode;
			}
		}
		// uniqueId isn't super exciting, so maybe we want to use something else
		uid = editor.dom.uniqueId( 'wp_' );
		editor.dom.setAttrib( node, 'data-wp-replace-id', uid );
		editor.dom.replace( node, nodeToReplace );

		// find the updated node
		node = editor.dom.select( '[data-wp-replace-id="' + uid + '"]' )[0];

		editor.dom.setAttrib( node, 'data-wp-replace-id', '' );

		editor.nodeChanged();

		editedImg = node.nodeName === 'IMG' ? node : editor.dom.select( 'img', node )[0];

		if ( editedImg ) {
			editor.selection.select( editedImg );
			// refresh toolbar
			addToolbar( editedImg );
		}
	}

	function createImageAndLink( imageData, mode ) {
		var classes = [],
			props;

		mode = mode ? mode : 'node';

		if ( ! imageData.caption ) {
			classes.push( 'align' + imageData.align );
		}

		if ( imageData.attachment_id ) {
			classes.push( 'wp-image-' + imageData.attachment_id );
			if ( imageData.size ) {
				classes.push( 'size-' + imageData.size );
			}
		}

		props = {
			src: imageData.url,
			width: imageData.width,
			height: imageData.height,
			alt: imageData.alt
		};

		if ( classes.length ) {
			props['class'] = classes.join( ' ' );
		}

		if ( imageData.linkUrl ) {
			if ( mode === 'node' ) {
				return editor.dom.create( 'a', { href: imageData.linkUrl }, editor.dom.createHTML( 'img', props ) );
			} else if ( mode === 'html' ) {
				return editor.dom.createHTML( 'a', { href: imageData.linkUrl }, editor.dom.createHTML( 'img', props ) );
			}
		} else if ( mode === 'node' ) {
			return editor.dom.create( 'img', props );
		} else if ( mode === 'html' ) {
			return editor.dom.createHTML( 'img', props );
		}
	}

	function editImage( img ) {
		var frame, callback;

		if ( typeof wp === 'undefined' || ! wp.media ) {
			editor.execCommand( 'mceImage' );
			return;
		}

		editor.undoManager.add();

		frame = wp.media({
			frame: 'image',
			state: 'image-details',
			metadata: extractImageData( img )
		} );

		callback = function( imageData ) {
			updateImage( img, imageData );
			editor.focus();
			frame.detach();
		};

		frame.state('image-details').on( 'update', callback );
		frame.state('replace-image').on( 'replace', callback );
		frame.on( 'close', function() {
			editor.focus();
			frame.detach();
		});

		frame.open();
	}

	function removeImage( node ) {
		var wrap;

		if ( node.nodeName === 'DIV' && editor.dom.hasClass( node, 'mceTemp' ) ) {
			wrap = node;
		} else if ( node.nodeName === 'IMG' || node.nodeName === 'DT' || node.nodeName === 'A' ) {
			wrap = editor.dom.getParent( node, 'div.mceTemp' );
		}

		if ( wrap ) {
			if ( wrap.nextSibling ) {
				editor.selection.select( wrap.nextSibling );
			} else if ( wrap.previousSibling ) {
				editor.selection.select( wrap.previousSibling );
			} else {
				editor.selection.select( wrap.parentNode );
			}

			editor.selection.collapse( true );
			editor.nodeChanged();
			editor.dom.remove( wrap );
		} else {
			editor.dom.remove( node );
		}
	}

	function addToolbar( node ) {
		var rectangle, toolbarHtml, toolbar, toolbarSize,
			dom = editor.dom;

		removeToolbar();

		// Don't add to placeholders
		if ( ! node || node.nodeName !== 'IMG' || isPlaceholder( node ) ) {
			return;
		}

		dom.setAttrib( node, 'data-wp-imgselect', 1 );
		rectangle = dom.getRect( node );

		toolbarHtml = '<div class="dashicons dashicons-edit edit" data-mce-bogus="1"></div>' +
			'<div class="dashicons dashicons-no-alt remove" data-mce-bogus="1"></div>';

		toolbar = dom.create( 'div', {
			'id': 'wp-image-toolbar',
			'data-mce-bogus': '1',
			'contenteditable': false
		}, toolbarHtml );

		editor.getBody().appendChild( toolbar );
		toolbarSize = dom.getSize( toolbar );

		dom.setStyles( toolbar, {
			top: rectangle.y,
			left: rectangle.x + rectangle.w - toolbarSize.w
		});
	}

	function removeToolbar() {
		var toolbar = editor.dom.get( 'wp-image-toolbar' );

		if ( toolbar ) {
			editor.dom.remove( toolbar );
		}

		editor.dom.setAttrib( editor.dom.select( 'img[data-wp-imgselect]' ), 'data-wp-imgselect', null );
	}

	function isPlaceholder( node ) {
		var dom = editor.dom;

		if ( dom.hasClass( node, 'mceItem' ) || dom.getAttrib( node, 'data-mce-placeholder' ) ||
			dom.getAttrib( node, 'data-mce-object' ) ) {

			return true;
		}

		return false;
	}

	editor.on( 'init', function() {
		var dom = editor.dom;

		if ( editor.getParam( 'wpeditimage_html5_captions' ) ) {
			dom.addClass( editor.getBody(), 'html5-captions' );
		}

		// Add caption field to the default image dialog
		editor.on( 'wpLoadImageForm', function( event ) {
			if ( editor.getParam( 'wpeditimage_disable_captions' ) ) {
				return;
			}

			var captionField = {
				type: 'textbox',
				flex: 1,
				name: 'caption',
				minHeight: 60,
				multiline: true,
				scroll: true,
				label: 'Image caption'
			};

			event.data.splice( event.data.length - 1, 0, captionField );
		});

		// Fix caption parent width for images added from URL
		editor.on( 'wpNewImageRefresh', function( event ) {
			var parent, captionWidth;

			if ( parent = dom.getParent( event.node, 'dl.wp-caption' ) ) {
				if ( ! parent.style.width ) {
					captionWidth = parseInt( event.node.clientWidth, 10 ) + 10;
					captionWidth = captionWidth ? captionWidth + 'px' : '50%';
					dom.setStyle( parent, 'width', captionWidth );
				}
			}
		});

		editor.on( 'wpImageFormSubmit', function( event ) {
			var data = event.imgData.data,
				imgNode = event.imgData.node,
				caption = event.imgData.caption,
				captionId = '',
				captionAlign = '',
				captionWidth = '',
				wrap, parent, node, html, imgId;

			// Temp image id so we can find the node later
			data.id = '__wp-temp-img-id';
			// Cancel the original callback
			event.imgData.cancel = true;

			if ( ! data.style ) {
				data.style = null;
			}

			if ( ! data.src ) {
				// Delete the image and the caption
				if ( imgNode ) {
					if ( wrap = dom.getParent( imgNode, 'div.mceTemp' ) ) {
						dom.remove( wrap );
					} else if ( imgNode.parentNode.nodeName === 'A' ) {
						dom.remove( imgNode.parentNode );
					} else {
						dom.remove( imgNode );
					}

					editor.nodeChanged();
				}
				return;
			}

			if ( caption ) {
				caption = caption.replace( /\r\n|\r/g, '\n' ).replace( /<\/?[a-zA-Z0-9]+( [^<>]+)?>/g, function( a ) {
					// No line breaks inside HTML tags
					return a.replace( /[\r\n\t]+/, ' ' );
				});

				// Convert remaining line breaks to <br>
				caption = caption.replace( /(<br[^>]*>)\s*\n\s*/g, '$1' ).replace( /\s*\n\s*/g, '<br />' );
			}

			if ( ! imgNode ) {
				// New image inserted
				html = dom.createHTML( 'img', data );

				if ( caption ) {
					node = editor.selection.getNode();

					if ( data.width ) {
						captionWidth = parseInt( data.width, 10 );

						if ( ! editor.getParam( 'wpeditimage_html5_captions' ) ) {
							captionWidth += 10;
						}

						captionWidth = ' style="width: ' + captionWidth + 'px"';
					}

					html = '<dl class="wp-caption alignnone"' + captionWidth + '>' +
						'<dt class="wp-caption-dt">'+ html +'</dt><dd class="wp-caption-dd">'+ caption +'</dd></dl>';

					if ( node.nodeName === 'P' ) {
						parent = node;
					} else {
						parent = dom.getParent( node, 'p' );
					}

					if ( parent && parent.nodeName === 'P' ) {
						wrap = dom.create( 'div', { 'class': 'mceTemp' }, html );
						dom.insertAfter( wrap, parent );
						editor.selection.select( wrap );
						editor.nodeChanged();

						if ( dom.isEmpty( parent ) ) {
							dom.remove( parent );
						}
					} else {
						editor.selection.setContent( '<div class="mceTemp">' + html + '</div>' );
					}
				} else {
					editor.selection.setContent( html );
				}
			} else {
				// Edit existing image

				// Store the original image id if any
				imgId = imgNode.id || null;
				// Update the image node
				dom.setAttribs( imgNode, data );
				wrap = dom.getParent( imgNode, 'dl.wp-caption' );

				if ( caption ) {
					if ( wrap ) {
						if ( parent = dom.select( 'dd.wp-caption-dd', wrap )[0] ) {
							parent.innerHTML = caption;
						}
					} else {
						if ( imgNode.className ) {
							captionId = imgNode.className.match( /wp-image-([0-9]+)/ );
							captionAlign = imgNode.className.match( /align(left|right|center|none)/ );
						}

						if ( captionAlign ) {
							captionAlign = captionAlign[0];
							imgNode.className = imgNode.className.replace( /align(left|right|center|none)/g, '' );
						} else {
							captionAlign = 'alignnone';
						}

						captionAlign = ' class="wp-caption ' + captionAlign + '"';

						if ( captionId ) {
							captionId = ' id="attachment_' + captionId[1] + '"';
						}

						captionWidth = data.width || imgNode.clientWidth;

						if ( captionWidth ) {
							captionWidth = parseInt( captionWidth, 10 );

							if ( ! editor.getParam( 'wpeditimage_html5_captions' ) ) {
								captionWidth += 10;
							}

							captionWidth = ' style="width: '+ captionWidth +'px"';
						}

						if ( imgNode.parentNode && imgNode.parentNode.nodeName === 'A' ) {
							html = dom.getOuterHTML( imgNode.parentNode );
							node = imgNode.parentNode;
						} else {
							html = dom.getOuterHTML( imgNode );
							node = imgNode;
						}

						html = '<dl ' + captionId + captionAlign + captionWidth + '>' +
							'<dt class="wp-caption-dt">'+ html +'</dt><dd class="wp-caption-dd">'+ caption +'</dd></dl>';

						if ( parent = dom.getParent( imgNode, 'p' ) ) {
							wrap = dom.create( 'div', { 'class': 'mceTemp' }, html );
							dom.insertAfter( wrap, parent );
							editor.selection.select( wrap );
							editor.nodeChanged();

							// Delete the old image node
							dom.remove( node );

							if ( dom.isEmpty( parent ) ) {
								dom.remove( parent );
							}
						} else {
							editor.selection.setContent( '<div class="mceTemp">' + html + '</div>' );
						}
					}
				} else {
					if ( wrap ) {
						// Remove the caption wrapper and place the image in new paragraph
						if ( imgNode.parentNode.nodeName === 'A' ) {
							html = dom.getOuterHTML( imgNode.parentNode );
						} else {
							html = dom.getOuterHTML( imgNode );
						}

						parent = dom.create( 'p', {}, html );
						dom.insertAfter( parent, wrap.parentNode );
						editor.selection.select( parent );
						editor.nodeChanged();
						dom.remove( wrap.parentNode );
					}
				}
			}

			imgNode = dom.get('__wp-temp-img-id');
			dom.setAttrib( imgNode, 'id', imgId );
			event.imgData.node = imgNode;
		});

		editor.on( 'wpLoadImageData', function( event ) {
			var parent,
				data = event.imgData.data,
				imgNode = event.imgData.node;

			if ( parent = dom.getParent( imgNode, 'dl.wp-caption' ) ) {
				parent = dom.select( 'dd.wp-caption-dd', parent )[0];

				if ( parent ) {
					data.caption = editor.serializer.serialize( parent )
						.replace( /<br[^>]*>/g, '$&\n' ).replace( /^<p>/, '' ).replace( /<\/p>$/, '' );
				}
			}
		});

		dom.bind( editor.getDoc(), 'dragstart', function( event ) {
			var node = editor.selection.getNode();

			// Prevent dragging images out of the caption elements
			if ( node.nodeName === 'IMG' && dom.getParent( node, '.wp-caption' ) ) {
				event.preventDefault();
			}

			// Remove toolbar to avoid an orphaned toolbar when dragging an image to a new location
			removeToolbar();
		});

		// Prevent IE11 from making dl.wp-caption resizable
		if ( tinymce.Env.ie && tinymce.Env.ie > 10 ) {
			// The 'mscontrolselect' event is supported only in IE11+
			dom.bind( editor.getBody(), 'mscontrolselect', function( event ) {
				if ( event.target.nodeName === 'IMG' && dom.getParent( event.target, '.wp-caption' ) ) {
					// Hide the thick border with resize handles around dl.wp-caption
					editor.getBody().focus(); // :(
				} else if ( event.target.nodeName === 'DL' && dom.hasClass( event.target, 'wp-caption' ) ) {
					// Trigger the thick border with resize handles...
					// This will make the caption text editable.
					event.target.focus();
				}
			});

			editor.on( 'click', function( event ) {
				if ( event.target.nodeName === 'IMG' && dom.getAttrib( event.target, 'data-wp-imgselect' ) &&
					dom.getParent( event.target, 'dl.wp-caption' ) ) {

					editor.getBody().focus();
				}
			});
		}
	});

	editor.on( 'ObjectResized', function( event ) {
        var parent, width,
			node = event.target;

		if ( node.nodeName === 'IMG' ) {
			if ( parent = editor.dom.getParent( node, '.wp-caption' ) ) {
				width = event.width || editor.dom.getAttrib( node, 'width' );

				if ( width ) {
					width = parseInt( width, 10 );

					if ( ! editor.getParam( 'wpeditimage_html5_captions' ) ) {
						width += 10;
					}

					editor.dom.setStyle( parent, 'width', width + 'px' );
				}
			}
			// refresh toolbar
			addToolbar( node );
		}
    });

	editor.on( 'BeforeExecCommand', function( event ) {
		var node, p, DL, align,
			cmd = event.command,
			dom = editor.dom;

		if ( cmd === 'mceInsertContent' ) {
			// When inserting content, if the caret is inside a caption create new paragraph under
			// and move the caret there
			if ( node = dom.getParent( editor.selection.getNode(), 'div.mceTemp' ) ) {
				p = dom.create( 'p' );
				dom.insertAfter( p, node );
				editor.selection.setCursorLocation( p, 0 );
				editor.nodeChanged();

				if ( tinymce.Env.ie > 8 ) {
					setTimeout( function() {
						editor.selection.setCursorLocation( p, 0 );
						editor.selection.setContent( event.value );
					}, 500 );

					return false;
				}
			}
		} else if ( cmd === 'JustifyLeft' || cmd === 'JustifyRight' || cmd === 'JustifyCenter' ) {
			node = editor.selection.getNode();
			align = cmd.substr(7).toLowerCase();
			align = 'align' + align;

			removeToolbar();

			if ( dom.is( node, 'dl.wp-caption' ) ) {
				DL = node;
			} else {
				DL = dom.getParent( node, 'dl.wp-caption' );
			}

			if ( DL ) {
				// When inside an image caption, set the align* class on dl.wp-caption
				if ( dom.hasClass( DL, align ) ) {
					dom.removeClass( DL, align );
					dom.addClass( DL, 'alignnone' );
				} else {
					DL.className = DL.className.replace( /align[^ ]+/g, '' );
					dom.addClass( DL, align );
				}

				return false;
			}

			if ( node.nodeName === 'IMG' ) {
				if ( dom.hasClass( node, align ) ) {
					// The align class is being removed
					dom.addClass( node, 'alignnone' );
				} else {
					dom.removeClass( node, 'alignnone' );
				}
			}
		}
	});

	editor.on( 'keydown', function( event ) {
		var node, wrap, P, spacer,
			selection = editor.selection,
			dom = editor.dom;

		if ( event.keyCode === tinymce.util.VK.ENTER ) {
			// When pressing Enter inside a caption move the caret to a new parapraph under it
			node = selection.getNode();
			wrap = dom.getParent( node, 'div.mceTemp' );

			if ( wrap ) {
				dom.events.cancel( event ); // Doesn't cancel all :(

				// Remove any extra dt and dd cleated on pressing Enter...
				tinymce.each( dom.select( 'dt, dd', wrap ), function( element ) {
					if ( dom.isEmpty( element ) ) {
						dom.remove( element );
					}
				});

				spacer = tinymce.Env.ie && tinymce.Env.ie < 11 ? '' : '<br data-mce-bogus="1" />';
				P = dom.create( 'p', null, spacer );

				if ( node.nodeName === 'DD' ) {
					dom.insertAfter( P, wrap );
				} else {
					wrap.parentNode.insertBefore( P, wrap );
				}

				editor.nodeChanged();
				selection.setCursorLocation( P, 0 );
			}
		} else if ( event.keyCode === tinymce.util.VK.DELETE || event.keyCode === tinymce.util.VK.BACKSPACE ) {
			node = selection.getNode();

			if ( node.nodeName === 'DIV' && dom.hasClass( node, 'mceTemp' ) ) {
				wrap = node;
			} else if ( node.nodeName === 'IMG' || node.nodeName === 'DT' || node.nodeName === 'A' ) {
				wrap = dom.getParent( node, 'div.mceTemp' );
			}

			if ( wrap ) {
				dom.events.cancel( event );
				removeImage( node );
				return false;
			}
		}
	});

	editor.on( 'mousedown', function( event ) {
		if ( editor.dom.getParent( event.target, '#wp-image-toolbar' ) ) {
			if ( tinymce.Env.ie ) {
				// Stop IE > 8 from making the wrapper resizable on mousedown
				event.preventDefault();
			}
		} else if ( event.target.nodeName !== 'IMG' ) {
			removeToolbar();
		}
	});

	editor.on( 'mouseup', function( event ) {
		var image,
			node = event.target,
			dom = editor.dom;

		// Don't trigger on right-click
		if ( event.button && event.button > 1 ) {
			return;
		}

		if ( node.nodeName === 'DIV' && dom.getParent( node, '#wp-image-toolbar' ) ) {
			image = dom.select( 'img[data-wp-imgselect]' )[0];

			if ( image ) {
				editor.selection.select( image );

				if ( dom.hasClass( node, 'remove' ) ) {
					removeImage( image );
					removeToolbar();
				} else if ( dom.hasClass( node, 'edit' ) ) {
					editImage( image );
				}
			}
		} else if ( node.nodeName === 'IMG' && ! editor.dom.getAttrib( node, 'data-wp-imgselect' ) && ! isPlaceholder( node ) ) {
			addToolbar( node );
		} else if ( node.nodeName !== 'IMG' ) {
			removeToolbar();
		}
	});

	editor.on( 'cut', function() {
		removeToolbar();
	});

	editor.wpSetImgCaption = function( content ) {
		return parseShortcode( content );
	};

	editor.wpGetImgCaption = function( content ) {
		return getShortcode( content );
	};

	editor.on( 'BeforeSetContent', function( event ) {
		event.content = editor.wpSetImgCaption( event.content );
	});

	editor.on( 'PostProcess', function( event ) {
		if ( event.get ) {
			event.content = editor.wpGetImgCaption( event.content );
			event.content = event.content.replace( / data-wp-imgselect="1"/g, '' );
		}
	});

	return {
		_do_shcode: parseShortcode,
		_get_shcode: getShortcode
	};
});
