import { useParams } from 'react-router-dom';

export function OfferDetailPage() {
  const { id } = useParams();

  return (
    <section className="panel">
      <p className="eyebrow">Offer</p>
      <h2>Offer detail placeholder</h2>
      <p>Минимальная страница для публичной карточки офера.</p>
      <p>Offer ID: {id}</p>
    </section>
  );
}
