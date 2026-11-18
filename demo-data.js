import { randomBytes } from 'node:crypto';

export const demoLogin = 'til_demo';

export function seedDemo(db) {
  const addAccount = db.prepare('INSERT INTO accounts(login,name,salt,password_hash,admin) VALUES(?,?,?,?,?)');
  const add = (login, name, admin = 0) => addAccount.run(
    login, name, randomBytes(16).toString('hex'), randomBytes(64).toString('hex'), admin
  ).lastInsertRowid;
  add(demoLogin, 'Демо-владелец', 1);
  const aruzhan = add('demo_aruzhan', 'Аружан');
  const dias = add('demo_dias', 'Диас');
  const now = Date.now();
  const note = db.prepare('INSERT INTO feedback(account_id,category,message,created,state) VALUES(?,?,?,?,?)');
  note.run(aruzhan, 'lesson', 'В диалоге на вокзале пригодился бы пример, как попросить место у окна.', now - 3600000, 'open');
  note.run(dias, 'idea', 'Хочу потренировать фразы для заказа еды на казахском.', now - 86400000, 'open');
  note.run(aruzhan, 'interface', 'На телефоне теперь удобно вводить буквы ә, ң и қ.', now - 172800000, 'closed');
}
