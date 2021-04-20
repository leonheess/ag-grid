import { ExcelImage, ExcelOOXMLTemplate, XmlElement } from '@ag-grid-community/core';
import { ExcelXlsxFactory } from '../../excelXlsxFactory';

const PIXEL_TO_INCH = 0.0104166667;
const INCH_TO_EXCEL = 914499;

interface ImageColor {
    color: string;
    tint?: number;
    saturation?: number;
}

const convertFromPixelToExcel = (value: number): number => {
    return Math.ceil(value * PIXEL_TO_INCH * INCH_TO_EXCEL);
}

const getAnchor = (name: string, image: ExcelImage): XmlElement => {
    if (!image.width || !image.height) {
        image.fitCell = true;
    }

    const diff = name === 'to' && image.fitCell ? 1 : 0;

    let offsetX: number = 0
    let offsetY: number = 0
    let width: number = 0
    let height: number = 0

    if (!image.fitCell) {
        offsetX = convertFromPixelToExcel((image.position && image.position.offsetX) || 0);
        offsetY = convertFromPixelToExcel((image.position && image.position.offsetY) || 0);
        width = convertFromPixelToExcel(image.width!);
        height = convertFromPixelToExcel(image.height!);
    }

    return {
        name: `xdr:${name}`,
        children: [{
            name: 'xdr:col',
            textNode: ((image.position!.column! + diff) - 1).toString()
        }, {
            name: 'xdr:colOff',
            textNode: name === 'from' ? offsetX.toString() : image.fitCell ? '0' : (offsetX + width).toString()
        }, {
            name: 'xdr:row',
            textNode: ((image.position!.row! + diff) - 1).toString()
        }, {
            name: 'xdr:rowOff',
            textNode: name === 'from' ? offsetY.toString() : image.fitCell ? '0' : (offsetY + height).toString()
        }]
    }
};

const getExt = (image: ExcelImage): XmlElement => {
    const children: XmlElement[] = [{
        name: 'a:ext',
        properties: {
            rawMap: {
                uri: '{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}'
            }
        },
        children: [{
            name: 'a16:creationId',
            properties: {
                rawMap: {
                    id: '{822E6D20-D7BC-2841-A643-D49A6EF008A2}',
                    'xmlns:a16': 'http://schemas.microsoft.com/office/drawing/2014/main'
                }
            }
        }]
    }];
    const recolor = image.recolor && image.recolor.toLowerCase();

    switch (recolor) {
        case 'grayscale':
        case 'sepia':
        case 'washout':
            children.push({
                name: 'a:ext',
                properties: {
                    rawMap: {
                        uri: '{C183D7F6-B498-43B3-948B-1728B52AA6E4}'
                    }
                },
                children: [{
                    name: 'adec:decorative',
                    properties: {
                        rawMap: {
                            val: '0',
                            'xmlns:adec': 'http://schemas.microsoft.com/office/drawing/2017/decorative'
                        }
                    }
                }]
            });
    }

    return {
        name: 'a:extLst',
        children
    }
};

const getNvPicPr = (image: ExcelImage, index: number) => ({
    name: 'xdr:nvPicPr',
    children: [{
        name: 'xdr:cNvPr',
        properties: {
            rawMap: {
                id: index,
                name: image.id,
                descr: image.altText != null ? image.altText : undefined
            }
        },
        children: [getExt(image)]
    }, {
        name: 'xdr:cNvPicPr',
        children: [{
            name: 'a:picLocks'
        }]
    }]
});

const getColorDetails = (color: ImageColor): XmlElement[] | undefined => {
    if (!color.saturation && !color.tint) { return; }
    const ret: XmlElement[] = [];

    if (color.saturation) {
        ret.push({
            name: 'a:satMod',
            properties: {
                rawMap: {
                    val: color.saturation * 1000
                }
            }
        });
    }

    if (color.tint) {
        ret.push({
            name: 'a:tint',
            properties: {
                rawMap: {
                    val: color.tint * 1000
                }
            }
        });
    }

    return ret;
}

const getDuoTone = (primaryColor: ImageColor, secondaryColor: ImageColor): XmlElement => {
    return ({
        name: 'a:duotone',
        children: [{
            name: 'a:prstClr',
            properties: {
                rawMap: {
                    val: primaryColor.color
                }
            },
            children: getColorDetails(primaryColor)
        }, {
            name: 'a:srgbClr',
            properties: {
                rawMap: {
                    val: secondaryColor.color
                }
            },
            children: getColorDetails(secondaryColor)
        }]
    });
};

const getBlipFill = (image: ExcelImage, index: number) => {
    let blipChildren: XmlElement[] | undefined;

    if (image.transparency) {
        const transparency = Math.min(Math.max(image.transparency, 0), 100);
        blipChildren = [{
            name: 'a:alphaModFix',
            properties: {
                rawMap: {
                    amt: 100000 - Math.round(transparency * 1000),
                }
            }
        }];
    }

    if (image.recolor) {
        if (!blipChildren) { blipChildren = []; }
        switch (image.recolor.toLocaleLowerCase()) {
            case 'grayscale':
                blipChildren.push({ name: 'a:grayscl' })
                break;
            case 'sepia':
                blipChildren.push(getDuoTone({ color: 'black' }, { color: 'D9C3A5', tint: 50, saturation: 180 }));
                break;
            case 'washout':
                blipChildren.push({
                    name: 'a:lum',
                    properties: {
                        rawMap: {
                            bright: '70000',
                            contrast: '-70000'
                        }
                    }
                });
                break;
            default:
        }
    }

    return ({
        name: 'xdr:blipFill',
        children: [{
            name: 'a:blip',
            properties: {
                rawMap: {
                    cstate: 'print',
                    'r:embed': `rId${index}`,
                    'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
                }
            },
            children: blipChildren
        }, {
            name:'a:stretch',
            children: [{
                name: 'a:fillRect'
            }]
        }]
    })
};

const getSpPr = (image: ExcelImage) => {
    const xfrm: XmlElement = {
        name: 'a:xfrm',
        children: [{
            name: 'a:off',
            properties: {
                rawMap: {
                    x: 0,
                    y: 0
                }
            }
        }, {
            name: 'a:ext',
            properties: {
                rawMap: {
                    cx: 0,
                    cy: 0
                }
            }
        }]
    };

    if (image.rotation) {
        const rotation = image.rotation;
        xfrm.properties = {
            rawMap: {
                rot: Math.min(Math.max(rotation, 0), 360) * 60000
            }
        }
    }

    const prstGeom: XmlElement = {
        name: 'a:prstGeom',
        properties: {
            rawMap: {
                prst: 'rect'
            }
        },
        children: [{ name: 'a:avLst' }]
    };

    const ret = {
        name: 'xdr:spPr',
        children: [xfrm, prstGeom]
    }

    return ret;
};

const getPicture = (image: ExcelImage, currentIndex: number, worksheetImageIndex: number): XmlElement => {
    return {
        name: 'xdr:pic',
        children: [
            getNvPicPr(image, currentIndex + 1),
            getBlipFill(image, worksheetImageIndex + 1),
            getSpPr(image)
        ]
    }
}

const drawingFactory: ExcelOOXMLTemplate = {
    getTemplate(config: {
        sheetIndex: number
    }) {
        const { sheetIndex } = config;
        const sheetImages = ExcelXlsxFactory.worksheetImages.get(sheetIndex);
        const sheetImageIds = ExcelXlsxFactory.worksheetImageIds.get(sheetIndex);

        const children = sheetImages!.map((image, idx) => ({
            name: 'xdr:twoCellAnchor',
            children: [
                getAnchor('from', image),
                getAnchor('to', image),
                getPicture(image, idx, sheetImageIds!.get(image.id)!.index),
                { name: 'xdr:clientData'}
            ]
        }));

        return {
            name: 'xdr:wsDr',
            properties: {
                rawMap: {
                    'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                    'xmlns:xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
                }
            },
            children
        }
    }
};

export default drawingFactory;
