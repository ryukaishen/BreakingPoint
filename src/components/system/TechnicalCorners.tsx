/** Make's TechnicalCorners: four brackets that lock onto a frame as it arrives. Decorative. */
export function TechnicalCorners() {
  return (
    <div className="tech-corners" aria-hidden="true">
      <span className="tech-corner tech-corner-nw" />
      <span className="tech-corner tech-corner-ne" />
      <span className="tech-corner tech-corner-sw" />
      <span className="tech-corner tech-corner-se" />
    </div>
  );
}
