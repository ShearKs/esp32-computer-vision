import { useState } from 'react';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonInput, IonText, IonAlert
} from '@ionic/react';
import { addOutline, saveOutline, trashOutline } from 'ionicons/icons';
import { NetworkProfile } from '../../types/interfaces';

interface Props {
  isOpen: boolean;
  profiles: NetworkProfile[];
  onDismiss: () => void;
  onChange: (index: number, field: 'name' | 'comment' | 'backend_ip' | 'esp32_ip' | 'esp32_stream_port', value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSave: () => void;
}

const ProfileEditorModal: React.FC<Props> = ({
  isOpen, profiles, onDismiss, onChange, onAdd, onRemove, onSave,
}) => {
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; name: string } | null>(null);

  const confirmDelete = () => {
    if (deleteTarget !== null) {
      onRemove(deleteTarget.index);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <IonModal isOpen={isOpen} onDidDismiss={onDismiss}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Editar perfiles</IonTitle>
            <IonButton slot="end" fill="clear" onClick={onDismiss}>
              Cerrar
            </IonButton>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <IonText color="medium" style={{ fontSize: 12 }}>
            Gestiona los perfiles de red. Los cambios se guardan en el servidor.
          </IonText>

          <div className="profile-list-editor">
            {profiles.map((p, i) => (
              <div key={i} className="profile-editor-card">
                <div className="profile-editor-card-header">
                  <IonText className="profile-editor-index">#{i + 1}</IonText>
                  <IonButton
                    fill="clear"
                    color="danger"
                    size="small"
                    onClick={() => setDeleteTarget({ index: i, name: p.name || `Perfil #${i + 1}` })}
                  >
                    <IonIcon icon={trashOutline} slot="start" />
                    Eliminar
                  </IonButton>
                </div>
                <IonInput
                  label="Nombre del perfil"
                  labelPlacement="stacked"
                  value={p.name}
                  onIonInput={e => onChange(i, 'name', e.detail.value!)}
                  className="profile-editor-input"
                  placeholder="Ej. Casa, Oficina..."
                />
                <IonInput
                  label="Comentario"
                  labelPlacement="stacked"
                  value={p.comment}
                  onIonInput={e => onChange(i, 'comment', e.detail.value!)}
                  className="profile-editor-input"
                  placeholder="Ej. Vodafone_1234"
                />
                <IonInput
                  label="IP del Backend"
                  labelPlacement="stacked"
                  value={p.backend_ip}
                  onIonInput={e => onChange(i, 'backend_ip', e.detail.value!)}
                  className="profile-editor-input"
                  placeholder="192.168.1.100"
                />
                <IonInput
                  label="IP del ESP32"
                  labelPlacement="stacked"
                  value={p.esp32_ip}
                  onIonInput={e => onChange(i, 'esp32_ip', e.detail.value!)}
                  className="profile-editor-input"
                  placeholder="192.168.1.132"
                />
                <IonInput
                  label="Puerto stream ESP32"
                  labelPlacement="stacked"
                  value={String(p.esp32_stream_port)}
                  onIonInput={e => onChange(i, 'esp32_stream_port', e.detail.value!)}
                  className="profile-editor-input"
                  placeholder="81"
                  type="number"
                />
              </div>
            ))}
          </div>

          {/* Botón para añadir: crea directamente una tarjeta vacía */}
          <IonButton
            expand="block"
            fill="outline"
            color="tertiary"
            onClick={onAdd}
            style={{ marginTop: 8 }}
          >
            <IonIcon icon={addOutline} slot="start" />
            Añadir perfil
          </IonButton>

          <IonButton expand="block" onClick={onSave} style={{ marginTop: 16 }}>
            <IonIcon icon={saveOutline} slot="start" />
            Guardar perfiles
          </IonButton>
        </IonContent>
      </IonModal>

      {/* Modal de confirmación para eliminar */}
      <IonAlert
        isOpen={deleteTarget !== null}
        header="Eliminar perfil"
        message={`¿Estás seguro de que quieres eliminar el perfil "${deleteTarget?.name ?? ''}"? Esta acción no se puede deshacer.`}
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
          { text: 'Eliminar', role: 'destructive', cssClass: 'alert-button-danger', handler: confirmDelete },
        ]}
        onDidDismiss={() => setDeleteTarget(null)}
      />
    </>
  );
};

export default ProfileEditorModal;
