// Render the canonical route geometry using macOS Core Graphics; no packages.
import AppKit
import Foundation

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
let data = try Data(contentsOf: root.appendingPathComponent("branding/interchange.json"))
let spec = try JSONSerialization.jsonObject(with: data) as! [String: Any]
let themes = spec["themes"] as! [String: [String: String]]
let routes = spec["routes"] as! [[String: Any]]
let station = spec["station"] as! [String: Double]
let out = root.appendingPathComponent("frontend/public/brand/v1")
func color(_ hex: String) -> CGColor {
    let value = UInt32(hex.dropFirst(), radix: 16)!
    return CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: [CGFloat((value >> 16) & 255)/255, CGFloat((value >> 8) & 255)/255, CGFloat(value & 255)/255, 1])!
}
for (theme, palette) in themes {
    let jobs = [16,32,48,64,128,256].map { ("favicon-\($0)-\(theme).png", $0, false) }
        + [("apple-touch-icon-\(theme).png",180,false)]
        + [192,384,512].map { ("icon-\($0)-\(theme).png",$0,false) }
        + [192,512].map { ("maskable-\($0)-\(theme).png",$0,true) }
    for (filename, size, masked) in jobs {
        let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size*4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(color(palette["background"]!))
        context.fill(CGRect(x: 0, y: 0, width: size, height: size))
        context.translateBy(x: 0, y: CGFloat(size))
        context.scaleBy(x: CGFloat(size)/32, y: -CGFloat(size)/32)
        let scale: CGFloat = masked ? 0.72 : 0.9
        let offset = 16 * (1-scale)
        context.translateBy(x: offset, y: offset)
        context.scaleBy(x: scale, y: scale)
        context.setShouldAntialias(true)
        context.setLineWidth(CGFloat(spec["strokeWidth"] as! Double))
        context.setLineCap(.round); context.setLineJoin(.round)
        for route in routes {
            context.beginPath()
            for command in route["commands"] as! [[Any]] {
                let kind = command[0] as! String
                let n = command.dropFirst().map { CGFloat(($0 as! NSNumber).doubleValue) }
                switch kind {
                case "M": context.move(to: CGPoint(x:n[0],y:n[1]))
                case "L": context.addLine(to: CGPoint(x:n[0],y:n[1]))
                case "C": context.addCurve(to: CGPoint(x:n[4],y:n[5]), control1: CGPoint(x:n[0],y:n[1]), control2: CGPoint(x:n[2],y:n[3]))
                default: fatalError("Unsupported path command")
                }
            }
            context.setStrokeColor(color(palette[route["color"] as! String]!)); context.strokePath()
        }
        let r = station["radius"]!
        context.setFillColor(color(palette["station"]!)); context.setStrokeColor(color(palette["outline"]!))
        context.setLineWidth(CGFloat(station["strokeWidth"]!))
        context.addEllipse(in: CGRect(x:station["cx"]!-r,y:station["cy"]!-r,width:r*2,height:r*2))
        context.drawPath(using: .fillStroke)
        let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
        try bitmap.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent(filename))
    }
}
print("Rendered light and dark PNG families")
